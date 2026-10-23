// Phomemo D30 over Web Bluetooth (BLE).
//
// Print commands come from community reverse-engineering of the D30
// (github.com/polskafan/phomemo_d30, github.com/crabdancing/phomemo-d30),
// which used Classic Bluetooth serial. The BLE service the D30 exposes is not
// documented, so we offer the browser a list of services common on cheap BLE
// thermal printers, log what the printer actually has, and write to the first
// writable characteristic we find.

const uuid16 = (n) => `0000${n}-0000-1000-8000-00805f9b34fb`;

// Full 128-bit UUID strings: some iOS Bluetooth browsers don't accept the short numeric form.
export const CANDIDATE_SERVICES = [
  ...['ff00', 'ffe0', 'fff0', 'fee7', '18f0', 'ae30', 'ae00', 'ae3a'].map(uuid16),
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip/ISSC transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

// Turns whatever a browser rejected with into readable text. Some browsers
// (seen in Bluefy) reject with values that aren't Error objects.
export function describeError(e) {
  if (e == null) return 'the browser gave no details';
  if (e && typeof e === 'object' && ('message' in e || 'name' in e)) return [e.name, e.message].filter(Boolean).join(': ') || 'unknown error';
  if (typeof e === 'string') return e || 'unknown error';
  try { return JSON.stringify(e) ?? String(e); } catch { return String(e); }
}

// Runs one connection step, labelling any failure with the step's name.
async function step(what, fn) {
  try {
    return await fn();
  } catch (e) {
    const err = new Error(`Failed while ${what}: ${describeError(e)}`);
    err.name = e?.name ?? 'Error'; // keep NotFoundError so a cancelled chooser stays recognisable
    throw err;
  }
}

// Setup packets sent before every job (same bytes in both reference projects).
const INIT_PACKETS = [
  '1f1138', '1f11121f1113', '1f1109', '1f1111', '1f1119', '1f1107', '1f110a1f110202',
];

// Darkness is not documented for the D30. These are the two density commands
// used by other Phomemo models; test.html prints test strips with each so we
// can find out which one (if either) the D30 obeys.
export const DENSITY_COMMANDS = {
  '1f1102': { name: '1F 11 02 n (D/M-series setting)', bytes: (n) => Uint8Array.of(0x1f, 0x11, 0x02, n) },
  '1b4e04': { name: 'ESC N 04 n (M110-style)', bytes: (n) => Uint8Array.of(0x1b, 0x4e, 0x04, n) },
};

const hex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuidShort = (u) => (/^0000(....)-0000-1000-8000-00805f9b34fb$/.exec(u)?.[1] ?? u);

export class D30Printer {
  constructor(log = console.log) {
    this.log = log;
    this.device = null;
    this.writeChar = null;
    this.chunkSize = 100; // bytes per BLE write
    this.chunkDelay = 20; // ms between writes, so the printer buffer keeps up
  }

  get connected() {
    return !!this.device?.gatt?.connected && !!this.writeChar;
  }

  async connect({ showAll = false } = {}) {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth not available. Use Chrome on the Mac or Bluefy on iPhone.');
    }
    this.writeChar = null;
    this.device = await step('choosing the printer', () => navigator.bluetooth.requestDevice(
      showAll
        ? { acceptAllDevices: true, optionalServices: CANDIDATE_SERVICES }
        : { filters: [{ namePrefix: 'D30' }], optionalServices: CANDIDATE_SERVICES },
    ));
    this.device.addEventListener('gattserverdisconnected', () => this.log('Printer disconnected'));
    this.log(`Connecting to ${this.device.name ?? 'device'}…`);
    const server = await step('connecting', () => this.device.gatt.connect());

    // Fast path: the layout the D30 is known to use (service ff00, write ff02, notify ff03).
    try {
      const service = await server.getPrimaryService(uuid16('ff00'));
      this.writeChar = await service.getCharacteristic(uuid16('ff02'));
      service.getCharacteristic(uuid16('ff03')).then((ch) => this.listen(ch)).catch(() => {});
      this.log('Using ff00 / ff02 for printing');
      return;
    } catch (e) {
      this.log(`ff00/ff02 not found (${describeError(e)}), scanning all services…`);
    }

    const services = await step('reading services', () => server.getPrimaryServices());
    if (!services.length) {
      throw new Error('Connected, but none of the candidate services exist. Check the UUIDs with nRF Connect.');
    }

    const writable = [];
    for (const service of services) {
      this.log(`Service ${uuidShort(service.uuid)}`);
      for (const ch of await step('reading characteristics', () => service.getCharacteristics())) {
        const p = ch.properties;
        const props = ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter((k) => p[k]);
        this.log(`  char ${uuidShort(ch.uuid)} [${props.join(', ')}]`);
        if (p.write || p.writeWithoutResponse) writable.push(ch);
        if (p.notify) await this.listen(ch);
      }
    }

    // Prefer the classic Phomemo layout (ff00 / ff02) if present.
    this.writeChar = writable.find((c) => uuidShort(c.uuid) === 'ff02') ?? writable[0];
    if (!this.writeChar) throw new Error('No writable characteristic found.');
    this.log(`Using ${uuidShort(this.writeChar.service.uuid)} / ${uuidShort(this.writeChar.uuid)} for printing`);
  }

  // Log what the printer sends back (status bytes).
  async listen(ch) {
    await ch.startNotifications().catch(() => {});
    ch.addEventListener('characteristicvaluechanged', (e) => {
      const bytes = new Uint8Array(e.target.value.buffer);
      this.log(`  ← ${uuidShort(ch.uuid)}: ${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
    });
  }

  disconnect() {
    this.device?.gatt?.disconnect();
  }

  async write(bytes) {
    const c = this.writeChar;
    for (let i = 0; i < bytes.length; i += this.chunkSize) {
      const chunk = bytes.subarray(i, i + this.chunkSize);
      if (c.properties.writeWithoutResponse) await c.writeValueWithoutResponse(chunk);
      else await c.writeValueWithResponse(chunk);
      if (this.chunkDelay) await sleep(this.chunkDelay);
    }
  }

  // raster: { bytes: Uint8Array, widthBytes, rows } — 1 bit per dot, MSB first, 1 = black.
  // density: { method: key of DENSITY_COMMANDS, value } or null for the printer's default.
  async print(raster, copies = 1, { density = null } = {}) {
    if (!this.connected) throw new Error('Printer not connected');
    for (let n = 0; n < copies; n++) {
      for (const p of INIT_PACKETS) await this.write(hex(p));
      const { widthBytes: w, rows: h } = raster;
      // 1f 11 24 00 (D30 prefix) · 1b 40 (ESC @ reset) · 1d 76 30 00 (GS v 0, raster) · width bytes LE · rows LE
      await this.write(Uint8Array.of(0x1f, 0x11, 0x24, 0x00, 0x1b, 0x40));
      const cmd = density && DENSITY_COMMANDS[density.method];
      if (cmd) await this.write(cmd.bytes(density.value)); // after ESC @ so the reset doesn't undo it
      await this.write(Uint8Array.of(0x1d, 0x76, 0x30, 0x00, w & 0xff, w >> 8, h & 0xff, h >> 8));
      await this.write(raster.bytes);
      this.log(`Sent copy ${n + 1}/${copies}: ${w * 8}×${h} dots, ${raster.bytes.length} bytes`);
      if (n < copies - 1) await sleep(1500);
    }
  }
}
