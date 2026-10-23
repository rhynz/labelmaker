import { D30Printer, describeError } from './printer.js';
import { toPrintCanvas, packBits } from './raster.js';
import { SIZES, DPM, newDoc, store } from './model.js';
import { renderToCanvas, thumbnail } from './render.js';
import { Editor, ADD_TYPES, readImageFile } from './editor.js';
import { parseCSV, readDataFile, fillDoc, placeholders, missingColumns } from './batch.js';

// Shown on the print screen so it's easy to tell whether a device has picked up an update. Bump on every push.
const BUILD = 14;
const $ = (sel) => document.querySelector(sel);
// Printer messages are kept for the log on the print screen (there's no console on iPhone).
const printerLog = [];
const printer = new D30Printer((m) => {
  console.log('[D30]', m);
  printerLog.push(`${new Date().toLocaleTimeString()} ${m}`);
  if (printerLog.length > 200) printerLog.shift();
  const pre = document.getElementById('printerLog');
  if (pre) pre.textContent = printerLog.join('\n');
});
let tab = 'labels';

// The toast is a popover where supported, so it also shows above open dialogs.
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  if (t.showPopover && !t.matches(':popover-open')) t.showPopover();
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- printer ----------
let connecting = false;
function updatePrinterPill() {
  for (const pill of document.querySelectorAll('.printer-pill')) {
    pill.dataset.on = printer.connected;
    pill.textContent = printer.connected ? `● ${printer.device.name ?? 'Printer'}` : connecting ? 'Connecting…' : '○ Connect printer';
  }
}
async function connectPrinter() {
  if (connecting) return;
  connecting = true;
  updatePrinterPill();
  try {
    await printer.connect();
    printer.device.addEventListener('gattserverdisconnected', updatePrinterPill);
    toast('Printer connected');
  } catch (e) {
    console.warn('[D30] connect failed:', e);
    // Closing the chooser is a NotFoundError too, but so are "Bluetooth is off" and missing permission.
    if (!(e?.name === 'NotFoundError' && /cancel/i.test(e.message))) toast(describeError(e), 8000);
  }
  connecting = false;
  updatePrinterPill();
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.printer-pill') && !printer.connected) connectPrinter();
});

// ---------- home ----------
function renderHome() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  const items = tab === 'labels' ? store.labels() : store.history();
  const grid = $('#grid');
  grid.replaceChildren();
  $('#empty').hidden = items.length > 0;
  $('#empty').textContent = tab === 'labels' ? 'No saved labels yet. Tap “New label” to make one.' : 'Nothing printed yet.';

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'card';
    const size = SIZES.find((s) => s.id === item.doc.sizeId)?.name ?? `${item.doc.lengthMM} mm`;
    const when = tab === 'history' ? new Date(item.printed).toLocaleString() : size;
    card.innerHTML = `<div class="thumb"><img alt=""></div><div class="meta"><strong></strong><span></span></div>`;
    card.querySelector('img').src = item.thumb;
    card.querySelector('strong').textContent = item.doc.name;
    card.querySelector('span').textContent = when;
    card.onclick = () => openEditor(structuredClone(item.doc), tab === 'history');

    if (tab === 'labels') {
      const menu = document.createElement('div');
      menu.className = 'card-actions';
      const dup = document.createElement('button');
      dup.textContent = 'Duplicate';
      dup.onclick = async (e) => {
        e.stopPropagation();
        const copy = { ...structuredClone(item.doc), id: newDoc().id, name: `${item.doc.name} copy` };
        store.saveLabel(copy, item.thumb);
        renderHome();
      };
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.className = 'danger';
      del.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete “${item.doc.name}”?`)) {
          store.deleteLabel(item.doc.id);
          renderHome();
        }
      };
      menu.append(dup, del);
      card.append(menu);
    }
    grid.append(card);
  }
}
document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => { tab = t.dataset.tab; renderHome(); }));

function sizeOptions(select, current) {
  select.replaceChildren(...SIZES.map((s) => new Option(s.name, s.id, false, s.id === current)));
  select.add(new Option('Custom length…', 'custom', false, current === 'custom'));
}

$('#newLabel').onclick = () => {
  sizeOptions($('#newSize'), localStorage.getItem('lastSize') ?? '12x40');
  $('#newDialog').showModal();
};
$('#newCreate').onclick = () => {
  const id = $('#newSize').value === 'custom' ? '12x40' : $('#newSize').value;
  try { localStorage.setItem('lastSize', id); } catch {}
  $('#newDialog').close();
  const doc = newDoc(id);
  const opened = openEditor(doc); // shows the editor straight away…
  editor.beginTyping(); // …so the keyboard can open during this tap (iOS requirement)
  opened.then(() => editor.add('text'));
};

// ---------- editor ----------
const editor = new Editor({ stage: $('#stage'), inspector: $('#inspector'), onChange: updateEditorBar, onMessage: toast });
editor.onZoom = (z) => { $('#zoomFit').textContent = `${Math.round(z * 100)}%`; };
$('#zoomIn').onclick = () => editor.setZoom(editor.zoom * 1.5);
$('#zoomOut').onclick = () => editor.setZoom(editor.zoom / 1.5);
$('#zoomFit').onclick = () => editor.setZoom(1);

function updateEditorBar() {
  $('#undo').disabled = !editor.canUndo;
  $('#redo').disabled = !editor.canRedo;
  $('#docName').value = editor.doc.name;
  sizeOptions($('#docSize'), editor.doc.sizeId);
}

async function openEditor(doc, fromHistory = false) {
  if (fromHistory) doc.id = newDoc().id; // reprints from history save as a new label
  $('#home').hidden = true;
  $('#editor').hidden = false;
  await editor.load(doc);
  updateEditorBar();
}

function closeEditor() {
  if (editor.dirty && editor.doc.elements.length) {
    const choice = confirm('Save changes to this label before leaving?');
    if (choice) saveLabel();
  }
  $('#editor').hidden = true;
  $('#home').hidden = false;
  renderHome();
}

async function saveLabel() {
  const ok = store.saveLabel(editor.doc, await thumbnail(editor.doc));
  if (ok) {
    editor.markSaved();
    toast('Saved');
  } else {
    toast('Could not save – storage is full (try smaller images)');
  }
}

const addBar = $('#addBar');
for (const [type, label, glyph] of ADD_TYPES) {
  const b = document.createElement('button');
  b.innerHTML = `<span class="glyph"></span><span></span>`;
  b.firstChild.textContent = glyph;
  b.lastChild.textContent = label;
  b.onclick = async () => {
    if (type !== 'image') return editor.add(type);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => input.files[0] && editor.add('image', { src: await readImageFile(input.files[0]) });
    input.click();
  };
  addBar.append(b);
}

$('#back').onclick = closeEditor;
$('#undo').onclick = () => editor.undo().then(updateEditorBar);
$('#redo').onclick = () => editor.redo().then(updateEditorBar);
$('#save').onclick = saveLabel;
$('#docName').oninput = () => { editor.doc.name = $('#docName').value || 'Untitled'; };
$('#docName').onchange = () => editor.commit();
$('#docSize').onchange = async () => {
  let id = $('#docSize').value;
  let length;
  if (id === 'custom') {
    length = Number(prompt('Label length in mm (continuous tape)', editor.doc.lengthMM));
    if (!length || length < 10 || length > 300) return updateEditorBar();
  } else {
    length = SIZES.find((s) => s.id === id).length;
  }
  await editor.setLength(length, id);
  updateEditorBar();
};
$('#export').onclick = async () => {
  const c = await renderToCanvas(editor.doc);
  const a = document.createElement('a');
  a.download = `${editor.doc.name}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
};

document.addEventListener('keydown', (e) => {
  if ($('#editor').hidden || e.target.matches('input, textarea, select')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'z') { e.preventDefault(); (e.shiftKey ? editor.redo() : editor.undo()).then(updateEditorBar); }
  else if (mod && e.key === 's') { e.preventDefault(); saveLabel(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selected) { e.preventDefault(); editor.remove(); }
  else if (e.key.startsWith('Arrow') && editor.selected) {
    e.preventDefault();
    const step = e.shiftKey ? 8 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    editor.nudge(...d);
  }
});

// ---------- print ----------
const settingsFields = ['copies', 'offsetX', 'offsetY', 'density', 'mirror', 'rotate180'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readSettings() {
  const s = {};
  for (const k of settingsFields) {
    const input = $(`#p-${k}`);
    s[k] = input.type === 'checkbox' ? input.checked : Number(input.value);
  }
  return s;
}

// The darkness option only appears once test.html has found a density command that works.
function setupDensityField() {
  const method = store.densityMethod();
  $('#p-densityRow').hidden = !method;
  const select = $('#p-density');
  select.replaceChildren(new Option('Printer default', 0), ...Array.from({ length: 15 }, (_, i) => new Option(i + 1, i + 1)));
}
const densityFor = (s) => (store.densityMethod() && s.density ? { method: store.densityMethod(), value: s.density } : null);

async function printImage(doc, s) {
  const design = await renderToCanvas(doc, { offset: { x: s.offsetX * DPM, y: s.offsetY * DPM } });
  if (!s.mirror) return design;
  const m = document.createElement('canvas');
  m.width = design.width;
  m.height = design.height;
  const ctx = m.getContext('2d');
  ctx.scale(-1, 1);
  ctx.drawImage(design, -design.width, 0);
  return m;
}

async function sendToPrinter(doc, s, copies) {
  const raster = packBits(toPrintCanvas(await printImage(doc, s), s.rotate180));
  await printer.print(raster, Math.max(1, copies), { density: densityFor(s) });
}

function showOn(canvas, img) {
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);
}

async function updatePrintPreview() {
  showOn($('#printPreview'), await printImage(editor.doc, readSettings()));
}

$('#print').onclick = async () => {
  const s = store.settings();
  setupDensityField();
  for (const k of settingsFields) {
    const input = $(`#p-${k}`);
    if (input.type === 'checkbox') input.checked = s[k];
    else input.value = s[k];
  }
  $('#printStatus').textContent = '';
  $('#build').textContent = `Build ${BUILD}`;
  updatePrinterPill();
  $('#printDialog').showModal();
  updatePrintPreview();
};
for (const k of settingsFields) $(`#p-${k}`).addEventListener('input', updatePrintPreview);
$('#printCancel').onclick = () => $('#printDialog').close();
$('#copyPrinterLog').onclick = () => navigator.clipboard.writeText(printerLog.join('\n')).then(() => toast('Log copied'), () => toast('Could not copy'));

$('#printNow').onclick = async () => {
  const btn = $('#printNow');
  if (btn.disabled) return;
  btn.disabled = true; // straight away, so a second tap can't start a second job
  const s = readSettings();
  store.saveSettings(s);
  if (!printer.connected) await connectPrinter();
  if (!printer.connected) { btn.disabled = false; return; }
  $('#printStatus').textContent = 'Printing…';
  try {
    await sendToPrinter(editor.doc, s, s.copies);
    store.addHistory(structuredClone(editor.doc), await thumbnail(editor.doc));
    $('#printStatus').textContent = 'Printed ✓';
    setTimeout(() => $('#printDialog').close(), 900);
  } catch (e) {
    $('#printStatus').textContent = `Error: ${e.message}`;
  }
  btn.disabled = false;
};

// ---------- batch print ----------
// The loaded sheet stays in memory for this session, so it survives closing the dialog.
const batch = { columns: [], rows: [], index: 0, printing: false, stop: false };

function setBatchData({ columns, rows }, source) {
  Object.assign(batch, { columns, rows, index: 0 });
  $('#b-info').textContent = rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'}${source ? ` · ${source}` : ''}` : 'No rows found';
  $('#b-from').value = 1;
  $('#b-to').value = Math.max(1, rows.length);
  $('#b-from').max = $('#b-to').max = Math.max(1, rows.length);
  updateBatch();
}

function updateBatchColumns() {
  $('#b-columnsWrap').hidden = !batch.columns.length;
  $('#b-columns').replaceChildren(...batch.columns.map((c) => {
    const b = document.createElement('button');
    b.textContent = c;
    b.onclick = () => {
      if (editor.insertPlaceholder(c)) { toast(`Added {{${c}}}`); updateBatch(); }
      else toast('Select a text, date, barcode or QR element first');
    };
    return b;
  }));
}

async function updateBatch() {
  updateBatchColumns();
  const used = placeholders(editor.doc);
  const missing = batch.columns.length ? missingColumns(editor.doc, batch.columns) : [];
  const warn = $('#b-warn');
  warn.hidden = !(missing.length || (batch.rows.length && !used.length));
  warn.textContent = missing.length
    ? `No column named ${missing.map((m) => `“${m}”`).join(', ')} – those placeholders will print as-is.`
    : 'This label has no {{column}} placeholders yet, so every row would print the same label.';

  const n = batch.rows.length;
  batch.index = Math.min(Math.max(0, batch.index), Math.max(0, n - 1));
  $('#b-row').textContent = n ? `Row ${batch.index + 1} of ${n}` : 'Load a file to preview rows';
  $('#b-prev').disabled = batch.index <= 0;
  $('#b-next').disabled = batch.index >= n - 1;
  $('#b-print').disabled = !n || batch.printing;

  const doc = n ? fillDoc(editor.doc, batch.rows[batch.index]) : editor.doc;
  showOn($('#b-preview'), await printImage(doc, { ...store.settings(), offsetX: 0, offsetY: 0 }));
}

$('#batch').onclick = () => {
  $('#b-status').textContent = '';
  updatePrinterPill();
  $('#batchDialog').showModal();
  updateBatch();
};
$('#b-file').onchange = async () => {
  const file = $('#b-file').files[0];
  if (!file) return;
  try {
    setBatchData(await readDataFile(file), file.name);
  } catch (e) {
    toast(e.message);
  }
  $('#b-file').value = '';
};
$('#b-paste').oninput = () => setBatchData(parseCSV($('#b-paste').value), 'pasted');
$('#b-prev').onclick = () => { batch.index--; updateBatch(); };
$('#b-next').onclick = () => { batch.index++; updateBatch(); };
$('#b-close').onclick = () => {
  if (batch.printing) batch.stop = true;
  else $('#batchDialog').close();
};

$('#batchDialog').addEventListener('cancel', (e) => {
  if (!batch.printing) return;
  e.preventDefault(); // Esc stops the run instead of hiding it
  batch.stop = true;
});

$('#b-print').onclick = async () => {
  if (batch.printing) return;
  batch.printing = true;
  if (!printer.connected) await connectPrinter();
  if (!printer.connected) { batch.printing = false; updateBatch(); return; }
  const n = batch.rows.length;
  const from = Math.min(Math.max(1, Number($('#b-from').value) || 1), n);
  const to = Math.min(Math.max(from, Number($('#b-to').value) || n), n);
  const copies = Math.max(1, Number($('#b-copies').value) || 1);
  const s = store.settings();
  Object.assign(batch, { printing: true, stop: false });
  $('#b-print').disabled = true;
  $('#b-close').textContent = 'Stop';
  try {
    for (let i = from - 1; i < to && !batch.stop; i++) {
      batch.index = i;
      updateBatch();
      $('#b-status').textContent = `Printing ${i - from + 2} of ${to - from + 1}…`;
      await sendToPrinter(fillDoc(editor.doc, batch.rows[i]), s, copies);
      if (i < to - 1) await sleep(1500); // let the printer finish feeding
    }
    $('#b-status').textContent = batch.stop ? 'Stopped' : 'Printed ✓';
    store.addHistory(structuredClone(editor.doc), await thumbnail(editor.doc));
  } catch (e) {
    $('#b-status').textContent = `Error: ${e.message}`;
  }
  batch.printing = false;
  $('#b-close').textContent = 'Close';
  updateBatch();
};

// ---------- start ----------
if (!navigator.bluetooth) {
  $('#noBluetooth').hidden = false;
}
updatePrinterPill();
renderHome();
// Offline support. Service workers need https or localhost; some in-app browsers don't offer them.
navigator.serviceWorker?.register('sw.js').catch((e) => console.warn('Offline mode unavailable:', e.message));

// #demo opens a label using every element type (handy for checking rendering).
if (location.hash === '#demo') {
  openEditor(newDoc('14x50')).then(async () => {
    await editor.add('border', { style: 'ticket' });
    await editor.add('icon', { icon: 'pill', x: 10, y: 14, w: 68, h: 68 });
    await editor.add('text', { text: 'BAC WATER', x: 80, y: 8, w: 226, h: 44, font: '"Archivo Black", sans-serif' });
    await editor.add('date', { x: 80, y: 52, w: 140, h: 36, size: 22, reverse: true });
    await editor.add('qr', { value: 'hello', x: 312, y: 14, w: 68, h: 68 });
    await editor.add('barcode', { value: '1234', x: 226, y: 52, w: 80, h: 36, showText: false });
  });
}
