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
    this.queue = Promise.resolve(); // print jobs run one at a time
    // Confirmed writes can't be silently dropped, but each one waits ~0.75 s for the printer's
    // reply (30 s per label, sometimes a 30 s hang). The raster pacing below already keeps the
    // printer from overflowing, so unconfirmed writes are the default.
    this.confirmWrites = false;
    // Raster pacing. The printer slows down on heavily black lines; sending faster than it
    // prints overflows its buffer, the lost bytes leave it waiting for the rest of the
    // label, and it feeds blank labels. So rows are sent at about print speed, slower for dark ones.
    this.rowsPerChunk = 8; // 96 bytes: whole rows, under the BLE packet size
    this.msPerRow = 7; // ~18 mm/s, a little under the printer's own speed
    this.msPerDot = 0.06; // extra time per black dot
  }

  get writeMode() {
    return this.confirmWrites && this.writeChar?.properties.write ? 'confirmed' : 'unconfirmed';
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
      const writeChar = await service.getCharacteristic(uuid16('ff02'));
      // Finish setting up status notifications before any print data is sent: on iPhone,
      // overlapping Bluetooth operations can garble the data, and the printer then reads
      // the garbage as commands (such as feeding labels).
      await service.getCharacteristic(uuid16('ff03')).then((ch) => this.listen(ch)).catch(() => {});
      await sleep(500); // let the link settle
      this.writeChar = writeChar;
      const props = ['write', 'writeWithoutResponse', 'notify'].filter((k) => writeChar.properties[k]);
      this.log(`Using ff00 / ff02 for printing [${props.join(', ')}], ${this.writeMode} writes`);
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
    const writeChar = writable.find((c) => uuidShort(c.uuid) === 'ff02') ?? writable[0];
    if (!writeChar) throw new Error('No writable characteristic found.');
    await sleep(500); // let the link settle
    this.writeChar = writeChar;
    this.log(`Using ${uuidShort(this.writeChar.service.uuid)} / ${uuidShort(this.writeChar.uuid)} for printing`);
  }

  // Log what the printer sends back (status bytes).
  // Send the image a few rows at a time, no faster than the printer can print them.
  async writeRaster({ bytes, widthBytes }) {
    const step = widthBytes * this.rowsPerChunk;
    const start = performance.now();
    let due = 0; // ms after start when the next chunk may go
    for (let i = 0; i < bytes.length; i += step) {
      const chunk = bytes.subarray(i, i + step);
      const wait = start + due - performance.now();
      if (wait > 0) await sleep(wait);
      if (this.writeMode === 'confirmed' || !this.writeChar.properties.writeWithoutResponse) await this.writeChar.writeValueWithResponse(chunk);
      else await this.writeChar.writeValueWithoutResponse(chunk);
      let dots = 0;
      for (const b of chunk) for (let v = b; v; v &= v - 1) dots++;
      due += (chunk.length / widthBytes) * this.msPerRow + dots * this.msPerDot;
    }
    this.log(`Image sent in ${((performance.now() - start) / 1000).toFixed(1)} s`);
  }

  // Repeats of the same message are counted rather than logged one by one.
  async listen(ch) {
    await ch.startNotifications().catch(() => {});
    let last = null, repeats = 0;
    ch.addEventListener('characteristicvaluechanged', (e) => {
      const msg = [...new Uint8Array(e.target.value.buffer)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
      if (msg === last) {
        repeats++;
        if (repeats % 50 === 0) this.log(`  ← ${uuidShort(ch.uuid)}: ${msg} (×${repeats + 1} so far)`);
        return;
      }
      if (repeats) this.log(`  ← ${uuidShort(ch.uuid)}: ${last} (×${repeats + 1} in total)`);
      last = msg;
      repeats = 0;
      this.log(`  ← ${uuidShort(ch.uuid)}: ${msg}`);
    });
  }

  disconnect() {
    this.device?.gatt?.disconnect();
  }

  async write(bytes) {
    const c = this.writeChar;
    const confirmed = this.writeMode === 'confirmed' || !c.properties.writeWithoutResponse;
    for (let i = 0; i < bytes.length; i += this.chunkSize) {
      const chunk = bytes.subarray(i, i + this.chunkSize);
      if (confirmed) {
        await c.writeValueWithResponse(chunk); // the acknowledgement paces the transfer
      } else {
        await c.writeValueWithoutResponse(chunk);
        if (this.chunkDelay) await sleep(this.chunkDelay);
      }
    }
  }

  // raster: { bytes: Uint8Array, widthBytes, rows } — 1 bit per dot, MSB first, 1 = black.
  // density: { method: key of DENSITY_COMMANDS, value } or null for the printer's default.
  print(raster, copies = 1, opts = {}) {
    // Queue behind any job still sending, so two jobs' bytes never interleave.
    const job = this.queue.then(() => this.send(raster, copies, opts));
    this.queue = job.catch(() => {});
    return job;
  }

  async send(raster, copies, { density = null } = {}) {
    if (!this.connected) throw new Error('Printer not connected');
    // Each copy gets the full setup and reset: without them the printer waits ~30 s before the next image.
    for (let n = 0; n < copies; n++) {
      for (const p of INIT_PACKETS) await this.write(hex(p));
      const { widthBytes: w, rows: h } = raster;
      // 1f 11 24 00 (D30 prefix) · 1b 40 (ESC @ reset) · 1d 76 30 00 (GS v 0, raster) · width bytes LE · rows LE
      await this.write(Uint8Array.of(0x1f, 0x11, 0x24, 0x00, 0x1b, 0x40));
      const cmd = density && DENSITY_COMMANDS[density.method];
      if (cmd) await this.write(cmd.bytes(density.value)); // after ESC @ so the reset doesn't undo it
      await this.write(Uint8Array.of(0x1d, 0x76, 0x30, 0x00, w & 0xff, w >> 8, h & 0xff, h >> 8));
      await this.writeRaster(raster);
      await this.write(Uint8Array.of(0x1b, 0x64, 0x00)); // ESC d 0: end of label, or the printer waits ~25 s for more
      this.log(`Sent copy ${n + 1}/${copies}: ${w * 8}×${h} dots, ${raster.bytes.length} bytes, ${this.writeMode} writes`);
      if (n < copies - 1) await sleep(1500);
    }
  }
}
