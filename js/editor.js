// The label editor: canvas interaction (select, move, resize, snap),
// undo/redo, and the inspector panel for the selected element.

import { FONTS, labelDots, newElement, uid } from './model.js';
import { prepare, draw } from './render.js';
import { ICONS, drawIcon } from './icons.js';
import { recognizeText, dictate, canDictate, scanCode, canScanCodes, pickPhoto } from './capture.js';

const SCALE = 4; // display pixels per dot
const SNAP = 3; // dots
const MIN = 6; // smallest element size, dots

const TEXT_STYLE = [
  { key: 'font', label: 'Font', kind: 'select', options: FONTS.map((f) => [f.css, f.name]) },
  { key: 'size', label: 'Max size', kind: 'number', min: 6, max: 96 },
  { key: 'bold', label: 'Bold', kind: 'check' },
  { key: 'italic', label: 'Italic', kind: 'check' },
  { key: 'underline', label: 'Underline', kind: 'check' },
  { key: 'reverse', label: 'Reverse (white on black)', kind: 'check' },
  { key: 'align', label: 'Align', kind: 'select', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
  { key: 'letterSpacing', label: 'Letter spacing', kind: 'number', min: -5, max: 20 },
  { key: 'lineSpacing', label: 'Line spacing', kind: 'number', min: 0.6, max: 2, step: 0.1 },
];

const FIELDS = {
  text: [{ key: 'text', label: 'Text', kind: 'textarea' }, ...TEXT_STYLE],
  date: [
    { key: 'prefix', label: 'Prefix', kind: 'text' },
    { key: 'format', label: 'Format', kind: 'select', options: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MMM DD, YYYY', 'DD MMM YYYY', 'MM/YYYY'].map((f) => [f, f]) },
    { key: 'offsetDays', label: 'Days from today', kind: 'number', min: -3650, max: 3650 },
    ...TEXT_STYLE,
  ],
  border: [
    { key: 'style', label: 'Style', kind: 'select', options: [['single', 'Square'], ['rounded', 'Rounded'], ['double', 'Double'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['ticket', 'Ticket']] },
    { key: 'stroke', label: 'Thickness', kind: 'number', min: 1, max: 12 },
  ],
  shape: [
    { key: 'shape', label: 'Shape', kind: 'select', options: [['rect', 'Rectangle'], ['rounded', 'Rounded'], ['ellipse', 'Ellipse']] },
    { key: 'fill', label: 'Filled', kind: 'check' },
    { key: 'stroke', label: 'Outline', kind: 'number', min: 1, max: 12 },
  ],
  line: [
    { key: 'h', label: 'Thickness', kind: 'number', min: 1, max: 20 },
    { key: 'dashed', label: 'Dashed', kind: 'check' },
  ],
  barcode: [
    { key: 'value', label: 'Value', kind: 'text' },
    { key: 'format', label: 'Type', kind: 'select', options: [['CODE128', 'Code 128'], ['CODE39', 'Code 39'], ['EAN13', 'EAN-13'], ['UPC', 'UPC-A'], ['ITF14', 'ITF-14']] },
    { key: 'showText', label: 'Show number', kind: 'check' },
  ],
  qr: [{ key: 'value', label: 'Text or link', kind: 'textarea' }],
  image: [
    { key: 'src', label: 'Replace image', kind: 'file' },
    { key: 'dither', label: 'Dither (for photos)', kind: 'check' },
    { key: 'invert', label: 'Invert', kind: 'check' },
  ],
  icon: [{ key: 'icon', label: 'Icon', kind: 'icons' }],
};

export const ADD_TYPES = [
  ['text', 'Text', 'T'], ['date', 'Date', '📅'], ['icon', 'Icon', '♥'], ['border', 'Border', '▢'],
  ['shape', 'Shape', '◯'], ['line', 'Line', '—'], ['barcode', 'Barcode', '║'], ['qr', 'QR', '▦'], ['image', 'Image', '🖼'],
];

// Downscale an uploaded image and return it as a PNG data URL.
export function readImageFile(file, maxSide = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export class Editor {
  constructor({ stage, inspector, onChange, onMessage = alert }) {
    this.stage = stage;
    this.inspector = inspector;
    this.onChange = onChange;
    this.onMessage = onMessage;
    this.label = document.createElement('canvas');
    this.guides = [];
    stage.addEventListener('pointerdown', (e) => this.down(e));
    stage.addEventListener('pointermove', (e) => this.move(e));
    stage.addEventListener('pointerup', () => this.up());
    stage.addEventListener('pointercancel', () => this.up());
    stage.addEventListener('dblclick', () => this.inspector.querySelector('textarea, input[type=text]')?.focus());
  }

  async load(doc) {
    this.doc = doc;
    this.selectedId = null;
    this.history = [JSON.stringify(doc)];
    this.index = 0;
    this.saved = this.history[0];
    await this.refresh();
  }

  get selected() {
    return this.doc.elements.find((e) => e.id === this.selectedId);
  }
  get dirty() {
    return JSON.stringify(this.doc) !== this.saved;
  }
  markSaved() {
    this.saved = JSON.stringify(this.doc);
  }

  // ---- undo/redo ----
  commit() {
    const json = JSON.stringify(this.doc);
    if (json === this.history[this.index]) return;
    this.history = this.history.slice(0, this.index + 1);
    this.history.push(json);
    this.index = this.history.length - 1;
    this.onChange?.();
  }
  async restore(delta) {
    const i = this.index + delta;
    if (i < 0 || i >= this.history.length) return;
    this.index = i;
    this.doc = JSON.parse(this.history[i]);
    if (!this.selected) this.selectedId = null;
    await this.refresh();
    this.onChange?.();
  }
  undo() { return this.restore(-1); }
  redo() { return this.restore(1); }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.history.length - 1; }

  // ---- drawing ----
  async refresh() {
    await prepare(this.doc);
    this.render();
    this.renderInspector();
  }

  render() {
    const { w, h } = labelDots(this.doc);
    draw(this.label, this.doc);
    // Show the label exactly as the printer will: hard black and white.
    const lctx = this.label.getContext('2d');
    const img = lctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 128 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    lctx.putImageData(img, 0, 0);

    const s = this.stage;
    s.width = w * SCALE;
    s.height = h * SCALE;
    s.style.aspectRatio = `${w} / ${h}`;
    const ctx = s.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.label, 0, 0, s.width, s.height);

    ctx.strokeStyle = '#e14b3b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    for (const g of this.guides) {
      ctx.beginPath();
      if (g.axis === 'x') { ctx.moveTo(g.at * SCALE, 0); ctx.lineTo(g.at * SCALE, s.height); }
      else { ctx.moveTo(0, g.at * SCALE); ctx.lineTo(s.width, g.at * SCALE); }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const el = this.selected;
    if (el) {
      ctx.lineWidth = 2;
      ctx.strokeRect(el.x * SCALE, el.y * SCALE, el.w * SCALE, el.h * SCALE);
      ctx.fillStyle = '#e14b3b';
      ctx.beginPath();
      ctx.arc((el.x + el.w) * SCALE, (el.y + el.h) * SCALE, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- pointer interaction ----
  toDots(e) {
    const r = this.stage.getBoundingClientRect();
    const { w, h } = labelDots(this.doc);
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h, perDot: r.width / w };
  }

  down(e) {
    const p = this.toDots(e);
    const sel = this.selected;
    const grab = 14 / p.perDot; // handle radius in dots
    if (sel && Math.hypot(p.x - (sel.x + sel.w), p.y - (sel.y + sel.h)) < grab) {
      this.drag = { mode: 'resize', el: sel, start: p, orig: { ...sel } };
    } else {
      const hit = [...this.doc.elements].reverse().find((el) => p.x >= el.x && p.x <= el.x + el.w && p.y >= el.y && p.y <= el.y + el.h);
      this.selectedId = hit?.id ?? null;
      this.renderInspector();
      if (hit) this.drag = { mode: 'move', el: hit, start: p, orig: { ...hit } };
    }
    if (this.drag) this.stage.setPointerCapture(e.pointerId);
    this.render();
  }

  move(e) {
    if (!this.drag) return;
    const { el, start, orig, mode } = this.drag;
    const p = this.toDots(e);
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    const { w, h } = labelDots(this.doc);
    this.guides = [];
    if (mode === 'move') {
      el.x = Math.round(orig.x + dx);
      el.y = Math.round(orig.y + dy);
      // Snap element centre or edges to the label centre and edges.
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      if (Math.abs(cx - w / 2) < SNAP) { el.x = Math.round(w / 2 - el.w / 2); this.guides.push({ axis: 'x', at: w / 2 }); }
      if (Math.abs(cy - h / 2) < SNAP) { el.y = Math.round(h / 2 - el.h / 2); this.guides.push({ axis: 'y', at: h / 2 }); }
      if (Math.abs(el.x) < SNAP) el.x = 0;
      if (Math.abs(el.y) < SNAP) el.y = 0;
      if (Math.abs(el.x + el.w - w) < SNAP) el.x = w - el.w;
      if (Math.abs(el.y + el.h - h) < SNAP) el.y = h - el.h;
    } else {
      el.w = Math.max(MIN, Math.round(orig.w + dx));
      el.h = Math.max(el.type === 'line' ? 1 : MIN, Math.round(orig.h + dy));
      if (el.type === 'qr' || el.type === 'icon') el.w = el.h = Math.max(el.w, el.h);
    }
    this.render();
  }

  up() {
    if (!this.drag) return;
    this.drag = null;
    this.guides = [];
    this.render();
    this.commit();
    this.renderInspector();
  }

  // ---- element commands ----
  async add(type, init = {}) {
    const el = { ...newElement(type, this.doc), ...init };
    this.doc.elements.push(el);
    this.selectedId = el.id;
    await this.refresh();
    this.commit();
    return el;
  }
  update(changes, { commit = false } = {}) {
    Object.assign(this.selected, changes);
    prepare(this.doc).then(() => this.render());
    if (commit) this.commit();
  }
  remove() {
    this.doc.elements = this.doc.elements.filter((e) => e.id !== this.selectedId);
    this.selectedId = null;
    this.refresh();
    this.commit();
  }
  duplicate() {
    const copy = { ...structuredClone(this.selected), id: uid(), x: this.selected.x + 8, y: this.selected.y + 4 };
    this.doc.elements.push(copy);
    this.selectedId = copy.id;
    this.refresh();
    this.commit();
  }
  reorder(toFront) {
    const el = this.selected;
    this.doc.elements = this.doc.elements.filter((e) => e !== el);
    toFront ? this.doc.elements.push(el) : this.doc.elements.unshift(el);
    this.render();
    this.commit();
  }
  alignTo(where) {
    const el = this.selected;
    const { w, h } = labelDots(this.doc);
    if (where === 'h') el.x = Math.round((w - el.w) / 2);
    if (where === 'v') el.y = Math.round((h - el.h) / 2);
    if (where === 'fill') Object.assign(el, { x: 4, y: 4, w: w - 8, h: h - 8 });
    this.render();
    this.commit();
  }
  nudge(dx, dy) {
    const el = this.selected;
    if (!el) return;
    el.x += dx;
    el.y += dy;
    this.render();
    this.commit();
  }
  // Put a {{column}} placeholder into the selected element: appended to text,
  // replacing a barcode/QR value. Returns false if nothing suitable is selected.
  insertPlaceholder(name) {
    const el = this.selected;
    const key = el && ['text', 'value', 'prefix'].find((k) => typeof el[k] === 'string');
    if (!key) return false;
    const tag = `{{${name}}}`;
    el[key] = key === 'value' || !el[key].trim() ? tag : `${el[key]} ${tag}`;
    this.refresh();
    this.commit();
    return true;
  }
  async setLength(lengthMM, sizeId) {
    const before = labelDots(this.doc).w;
    this.doc.lengthMM = lengthMM;
    this.doc.sizeId = sizeId;
    // Keep full-width elements (borders, text boxes) stretched to the new length.
    const after = labelDots(this.doc).w;
    for (const el of this.doc.elements) if (el.x + el.w >= before - 8 && el.x <= 8) el.w += after - before;
    await this.refresh();
    this.commit();
  }

  // ---- inspector ----
  renderInspector() {
    const box = this.inspector;
    const el = this.selected;
    box.replaceChildren();
    if (!el) {
      box.innerHTML = '<p class="hint">Tap an element on the label to edit it, or add one above.</p>';
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    const btn = (label, fn, title = label) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.onclick = fn;
      actions.append(b);
    };
    btn('↔ Center', () => this.alignTo('h'), 'Center horizontally');
    btn('↕ Center', () => this.alignTo('v'), 'Center vertically');
    btn('⤢ Fill', () => this.alignTo('fill'), 'Fill the label');
    btn('Front', () => this.reorder(true), 'Bring to front');
    btn('Back', () => this.reorder(false), 'Send to back');
    btn('Duplicate', () => this.duplicate());
    btn('Delete', () => this.remove());
    actions.lastChild.classList.add('danger');
    box.append(actions);

    const grid = document.createElement('div');
    grid.className = 'fields';
    for (const f of FIELDS[el.type]) grid.append(this.field(el, f));
    box.append(grid);
  }

  field(el, f) {
    const wrap = document.createElement('label');
    wrap.className = `field field-${f.kind}`;
    const name = document.createElement('span');
    name.textContent = f.label;
    let input;

    switch (f.kind) {
      case 'textarea':
        input = document.createElement('textarea');
        input.value = el[f.key];
        input.rows = 2;
        input.oninput = () => this.update({ [f.key]: input.value });
        break;
      case 'text':
        input = document.createElement('input');
        input.type = 'text';
        input.value = el[f.key];
        input.oninput = () => this.update({ [f.key]: input.value });
        break;
      case 'number':
        input = document.createElement('input');
        input.type = 'number';
        Object.assign(input, { min: f.min, max: f.max, step: f.step ?? 1, value: el[f.key] });
        input.oninput = () => input.value !== '' && this.update({ [f.key]: Number(input.value) });
        break;
      case 'check':
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = el[f.key];
        input.onchange = () => this.update({ [f.key]: input.checked }, { commit: true });
        wrap.append(input, name);
        return wrap;
      case 'select':
        input = document.createElement('select');
        for (const [value, text] of f.options) input.add(new Option(text, value, false, value === el[f.key]));
        input.onchange = () => this.update({ [f.key]: input.value }, { commit: true });
        break;
      case 'file':
        input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => input.files[0] && this.update({ src: await readImageFile(input.files[0]) }, { commit: true });
        break;
      case 'icons': {
        input = document.createElement('div');
        input.className = 'icon-grid';
        for (const name of Object.keys(ICONS)) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = name === el.icon ? 'on' : '';
          b.title = name;
          const c = document.createElement('canvas');
          c.width = c.height = 48;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, 48, 48);
          drawIcon(ctx, name, 6, 6, 36, 36);
          b.append(c);
          b.onclick = () => {
            this.update({ icon: name }, { commit: true });
            this.renderInspector();
          };
          input.append(b);
        }
        break;
      }
    }
    // Text-like inputs commit to undo history when editing pauses.
    if (f.kind === 'text' || f.kind === 'textarea' || f.kind === 'number') input.onchange = () => this.commit();
    wrap.append(name, input);
    if (f.key === 'text' || f.key === 'value') {
      const tools = this.captureTools(el);
      if (tools) wrap.append(tools);
    }
    return wrap;
  }

  // Scan / dictate buttons under a text, barcode or QR field. Results replace the field (undo restores it).
  captureTools(el) {
    const key = el.type === 'text' ? 'text' : 'value';
    const tools = document.createElement('div');
    tools.className = 'capture';
    const add = (label, run) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = async (e) => {
        e.preventDefault(); // don't let the surrounding <label> refocus the input
        b.disabled = true;
        try {
          const changes = await run(b);
          const target = this.doc.elements.find((x) => x.id === el.id);
          if (changes && target) {
            Object.assign(target, changes);
            await this.refresh();
            this.commit();
          }
        } catch (err) {
          this.onMessage(err.message);
        }
        b.disabled = false;
        b.textContent = label;
      };
      tools.append(b);
    };

    if (el.type === 'text') {
      add('📷 Scan text', async (b) => {
        const file = await pickPhoto();
        if (!file) return null;
        b.textContent = 'Loading scanner…';
        const text = await recognizeText(file, (p) => { b.textContent = `Reading… ${Math.round(p * 100)}%`; });
        if (!text) throw new Error('No text found in that photo');
        return { text };
      });
    }
    if (canScanCodes && (el.type === 'barcode' || el.type === 'qr')) {
      add(el.type === 'qr' ? '📷 Scan QR code' : '📷 Scan barcode', async () => {
        const file = await pickPhoto();
        if (!file) return null;
        const code = await scanCode(file);
        const format = el.type === 'barcode' && code.format && code.format !== 'qr' ? { format: code.format } : {};
        return { value: code.value, ...format };
      });
    }
    if (canDictate) {
      add('🎤 Dictate', async (b) => {
        b.textContent = 'Listening…';
        const words = await dictate();
        return words ? { [key]: words } : null;
      });
    }
    return tools.childElementCount ? tools : null;
  }
}
