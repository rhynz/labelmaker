import { D30Printer, DENSITY_COMMANDS } from './printer.js';
import { store } from './model.js';
import { makeDesignCanvas, toPrintCanvas, packBits } from './raster.js';

const $ = (id) => document.getElementById(id);
const logEl = $('log');
const log = (msg) => {
  logEl.textContent += `${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};

const printer = new D30Printer(log);

function setStatus() {
  $('status').textContent = printer.connected ? `Connected: ${printer.device.name ?? 'printer'}` : 'Not connected';
  $('status').dataset.on = printer.connected;
  $('print').disabled = !printer.connected;
  $('dPrint').disabled = !printer.connected;
}

// Draw the label text, shrinking the font until every line fits.
function renderDesign() {
  const design = makeDesignCanvas(Number($('length').value));
  const ctx = design.getContext('2d');
  const reverse = $('reverse').checked;
  const pad = 6;
  const lines = $('text').value.split('\n').filter((l) => l.trim() !== '');
  const weight = $('bold').checked ? '800' : '400';
  const family = $('font').value;

  ctx.fillStyle = reverse ? '#000' : '#fff';
  ctx.fillRect(0, 0, design.width, design.height);
  ctx.fillStyle = reverse ? '#fff' : '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let size = Math.min(Number($('size').value), (design.height - pad * 2) / Math.max(lines.length, 1));
  const fits = () => {
    ctx.font = `${weight} ${size}px ${family}`;
    return lines.every((l) => ctx.measureText(l).width <= design.width - pad * 2);
  };
  while (size > 6 && !fits()) size -= 1;

  const lineH = size * 1.05;
  const top = design.height / 2 - (lineH * (lines.length - 1)) / 2;
  lines.forEach((l, i) => ctx.fillText(l, design.width / 2, top + i * lineH));
  return design;
}

function updatePreview() {
  const design = renderDesign();
  const preview = $('preview');
  preview.width = design.width;
  preview.height = design.height;
  const ctx = preview.getContext('2d');
  ctx.drawImage(design, 0, 0);
  // Show exactly what the printer gets: hard black/white at the same threshold.
  const img = ctx.getImageData(0, 0, preview.width, preview.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 128 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

$('connect').onclick = async () => {
  try {
    await printer.connect({ showAll: $('showAll').checked });
  } catch (e) {
    log(`Error: ${e.message}`);
  }
  setStatus();
};

$('print').onclick = async () => {
  $('print').disabled = true;
  try {
    printer.chunkSize = Number($('chunk').value);
    printer.chunkDelay = Number($('delay').value);
    const raster = packBits(toPrintCanvas(renderDesign(), $('flip').checked));
    log(`Printing ${raster.widthBytes * 8}×${raster.rows} dots…`);
    await printer.print(raster, Number($('copies').value));
    log('Done');
  } catch (e) {
    log(`Error: ${e.message}`);
  }
  setStatus();
};

// ---- darkness experiment ----
for (const [key, c] of Object.entries(DENSITY_COMMANDS)) $('dMethod').add(new Option(c.name, key));

// A 12×40 strip: grey (checkerboard), hairlines and a solid block show darkness differences clearly.
function densityStrip(method, value) {
  const design = makeDesignCanvas(40);
  const ctx = design.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, design.width, design.height);
  ctx.fillStyle = '#000';
  for (let y = 0; y < 96; y++) for (let x = 0; x < 80; x++) if ((x + y) % 2 === 0) ctx.fillRect(x, y, 1, 1);
  for (let x = 88; x < 150; x += 4) ctx.fillRect(x, 0, 1, 96);
  ctx.fillRect(156, 0, 40, 96);
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${method === '1f1102' ? 'A' : 'B'}·${value}`, 206, 48);
  return design;
}

function showSaved() {
  const m = store.densityMethod();
  $('dSaved').textContent = m ? `App uses: ${DENSITY_COMMANDS[m]?.name ?? m}` : 'App: off (printer default)';
}

$('dPrint').onclick = async () => {
  const method = $('dMethod').value;
  const value = Math.min(15, Math.max(1, Number($('dValue').value) || 1));
  $('dPrint').disabled = true;
  try {
    const bytes = DENSITY_COMMANDS[method].bytes(value);
    log(`Darkness test: ${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
    await printer.print(packBits(toPrintCanvas(densityStrip(method, value))), 1, { density: { method, value } });
    log('Done');
  } catch (e) {
    log(`Error: ${e.message}`);
  }
  setStatus();
};
$('dUse').onclick = () => { store.saveDensityMethod($('dMethod').value); showSaved(); };
$('dClear').onclick = () => { store.saveDensityMethod(null); showSaved(); };
showSaved();

$('copyLog').onclick = () => navigator.clipboard.writeText(logEl.textContent);

for (const id of ['text', 'size', 'bold', 'reverse', 'length', 'font']) {
  $(id).addEventListener('input', updatePreview);
}
document.fonts.ready.then(updatePreview);
setStatus();
updatePreview();
if (!navigator.bluetooth) log('Web Bluetooth is not available in this browser. Use Chrome on the Mac or Bluefy on iPhone.');
