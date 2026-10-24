// The label editor: canvas interaction (select, move, resize, snap),
// undo/redo, and the inspector panel for the selected element.

import { FONTS, FONT_CATEGORIES, labelDots, newElement, uid } from './model.js';
import { loadFont } from './fonts.js';
import { prepare, draw, measureText, elementText, fitFontSize, fontCSS } from './render.js';
import { ICONS, drawIcon } from './icons.js';
import { recognizeText, dictate, canDictate, scanCode, canScanCodes, pickPhoto } from './capture.js';

const SNAP = 3; // dots
const MIN = 6; // smallest element size, dots

// Icons for the element action buttons (20×20, drawn in the current text colour).
const svg = (body) => `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ACTION_ICONS = {
  left: svg('<line x1="2.5" y1="2" x2="2.5" y2="18"/><rect x="5.5" y="6" width="11" height="8" rx="1.5"/>'),
  centerH: svg('<line x1="10" y1="2" x2="10" y2="18" stroke-dasharray="2 2"/><rect x="4.5" y="6" width="11" height="8" rx="1.5"/>'),
  right: svg('<line x1="17.5" y1="2" x2="17.5" y2="18"/><rect x="3.5" y="6" width="11" height="8" rx="1.5"/>'),
  top: svg('<line x1="2" y1="2.5" x2="18" y2="2.5"/><rect x="6" y="5.5" width="8" height="11" rx="1.5"/>'),
  bottom: svg('<line x1="2" y1="17.5" x2="18" y2="17.5"/><rect x="6" y="3.5" width="8" height="11" rx="1.5"/>'),
  centerV: svg('<line x1="2" y1="10" x2="18" y2="10" stroke-dasharray="2 2"/><rect x="6" y="4.5" width="8" height="11" rx="1.5"/>'),
  fill: svg('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><rect x="7" y="7" width="6" height="6" rx="1"/>'),
  front: svg('<rect x="2.5" y="2.5" width="10" height="10" rx="1.5" stroke-dasharray="2 2"/><rect x="7.5" y="7.5" width="10" height="10" rx="1.5" fill="currentColor"/>'),
  back: svg('<rect x="2.5" y="2.5" width="10" height="10" rx="1.5" fill="currentColor"/><rect x="7.5" y="7.5" width="10" height="10" rx="1.5" fill="var(--card)"/>'),
  duplicate: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><path d="M13.5 6.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h2.5"/>'),
  // A "T" with a box tight around it: the text box hugs its text.
  fitText: svg('<path d="M2.5 6V2.5H6M14 2.5h3.5V6M17.5 14v3.5H14M6 17.5H2.5V14"/><path d="M6.5 6.5h7M10 6.5v7.5" stroke-width="2.2"/>'),
  delete: svg('<path d="M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12M8.5 8.5v6M11.5 8.5v6"/>'),
};

// Text-alignment icon: four lines lined up on one side (or centred).
function alignIcon(side) {
  const lines = [18, 11, 18, 13].map((w, i) => {
    const x = side === 'left' ? 1 : side === 'right' ? 19 - w : (20 - w) / 2;
    return `<line x1="${x}" x2="${x + w}" y1="${2 + i * 4}" y2="${2 + i * 4}"/>`;
  });
  return `<svg viewBox="0 0 20 16" width="22" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${lines.join('')}</svg>`;
}

const TEXT_STYLE = [
  { key: 'box', label: 'Text box', kind: 'toggles', options: [['auto', 'Fit box to text', ACTION_ICONS.fitText]] },
  { key: 'font', label: 'Font', kind: 'fonts' },
  { key: 'size', label: 'Font size', kind: 'slider', min: 6, max: 96 },
  {
    key: 'style', label: 'Style', kind: 'toggles', options: [
      ['bold', 'Bold', '<b>B</b>'],
      ['italic', 'Italic', '<i class="serif">I</i>'],
      ['underline', 'Underline', '<u>U</u>'],
      ['reverse', 'Reverse (white on black)', '<span class="rev">A</span>'],
    ],
  },
  { key: 'align', label: 'Align', kind: 'segments', options: ['left', 'center', 'right'].map((v) => [v, `Align ${v}`, alignIcon(v)]) },
  { key: 'letterSpacing', label: 'Letter spacing', kind: 'slider', min: -5, max: 20 },
  { key: 'lineSpacing', label: 'Line spacing', kind: 'slider', min: 0.6, max: 2, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
];

const FIELDS = {
  text: [{ key: 'text', label: 'Text', kind: 'typing' }, ...TEXT_STYLE],
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
    this.zoom = 1;
    this.scale = 4; // canvas pixels per dot, set by layout()
    this.pointers = new Map(); // active touches/mouse, for pinch-zoom
    this.wrap = stage.parentElement; // scrolls when zoomed in
    stage.addEventListener('pointerdown', (e) => this.down(e));
    stage.addEventListener('pointermove', (e) => this.move(e));
    stage.addEventListener('pointerup', (e) => this.up(e));
    stage.addEventListener('pointercancel', (e) => this.up(e));
    // Trackpad pinch (and ⌘/Ctrl + scroll) zooms on the Mac.
    this.wrap.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY / 100), e.clientX - this.wrap.getBoundingClientRect().left);
    }, { passive: false });
    addEventListener('resize', () => { if (this.doc && this.stage.offsetParent) { this.layout(); this.render(); } });
    stage.addEventListener('dblclick', () => this.selected?.type === 'text' && this.startTyping(this.selected));

    // Text is typed straight onto the label: this textarea sits exactly over the text being edited.
    this.typer = document.createElement('textarea');
    this.typer.className = 'typer';
    Object.assign(this.typer, { rows: 1, spellcheck: false, autocomplete: 'off' });
    this.typer.setAttribute('aria-label', 'Label text');
    this.wrap.append(this.typer);
    this.typer.addEventListener('input', () => {
      const el = this.editing;
      if (!el) return;
      el.text = this.typer.value;
      this.fitBox(el);
      this.render();
    });
    this.typer.addEventListener('blur', () => this.stopTyping());
    this.typer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) this.typer.blur();
    });
  }

  async load(doc) {
    this.doc = doc;
    this.selectedId = null;
    this.history = [JSON.stringify(doc)];
    this.index = 0;
    this.saved = this.history[0];
    this.zoom = 1;
    await this.refresh();
    this.onZoom?.(this.zoom);
  }

  get selected() {
    return this.doc.elements.find((e) => e.id === this.selectedId);
  }
  get editing() {
    return this.editingId ? this.doc.elements.find((e) => e.id === this.editingId) : null;
  }

  // ---- typing on the label ----
  // iOS only opens the keyboard when focus happens during the tap itself, so callers that
  // create a text element asynchronously call this first, inside the tap handler.
  beginTyping() {
    this.typer.focus({ preventScroll: true });
  }
  startTyping(el, { selectAll = false } = {}) {
    this.editingId = el.id;
    this.selectedId = el.id;
    this.typer.value = el.text;
    this.typer.classList.add('on');
    this.render();
    this.typer.focus({ preventScroll: true });
    if (selectAll) this.typer.select();
    else this.typer.setSelectionRange(el.text.length, el.text.length);
  }
  stopTyping() {
    const el = this.editing;
    if (!el) return;
    this.editingId = null;
    this.typer.classList.remove('on');
    const empty = !el.text.trim();
    if (el.id === this.newTextId && !empty) this.place(el); // move a just-typed text into free space
    this.newTextId = null;
    if (empty) {
      // Typing nothing (or deleting everything) removes the text.
      this.doc.elements = this.doc.elements.filter((e) => e !== el);
      this.selectedId = null;
    }
    this.render();
    this.commit();
    // Only rebuild the inspector when needed: rebuilding it here would swallow a tap on one of its controls.
    if (empty) this.renderInspector();
  }
  // Match the textarea to how the label draws this text, in screen pixels.
  placeTyper() {
    const el = this.editing;
    if (!el) return;
    const k = this.stage.clientWidth / labelDots(this.doc).w; // screen px per dot
    const size = fitFontSize(el, el.text) * k;
    const lines = el.text.split('\n').length;
    const pad = (el.reverse ? 4 : 0) * k;
    const t = this.typer.style;
    t.left = `${this.stage.offsetLeft + el.x * k}px`;
    t.top = `${this.stage.offsetTop + el.y * k}px`;
    t.width = `${el.w * k}px`;
    t.height = `${el.h * k}px`;
    t.font = fontCSS(el, size);
    t.lineHeight = `${size * el.lineSpacing}px`;
    t.letterSpacing = `${el.letterSpacing * k}px`;
    t.textAlign = el.align;
    t.textDecoration = el.underline ? 'underline' : 'none';
    t.padding = `${Math.max(0, (el.h * k - size * (1 + el.lineSpacing * (lines - 1))) / 2 - (size * (el.lineSpacing - 1)) / 2)}px ${pad}px 0`;
    t.color = el.reverse ? '#fff' : '#000';
    t.background = el.reverse ? '#000' : '#fff';
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
    this.layout();
    this.render();
    this.renderInspector();
  }

  // ---- zoom ----
  // At zoom 1 the label fills the available width (but no more than ~40% of the screen height).
  layout() {
    const { w, h } = labelDots(this.doc);
    const avail = this.wrap.clientWidth - 24;
    const fit = Math.max(100, Math.min(avail, (innerHeight * 0.4 * w) / h));
    const css = Math.round(fit * this.zoom);
    this.stage.style.width = `${css}px`;
    this.scale = Math.min(8, Math.max(2, Math.ceil((css * devicePixelRatio) / w)));
  }

  // anchor: x position (px from the left of the scroll area) that should stay put while zooming.
  setZoom(z, anchor = this.wrap.clientWidth / 2) {
    const old = this.zoom;
    this.zoom = Math.min(6, Math.max(1, z));
    if (this.zoom === old) return;
    const contentX = this.wrap.scrollLeft + anchor;
    this.layout();
    this.render();
    this.wrap.scrollLeft = contentX * (this.zoom / old) - anchor;
    this.onZoom?.(this.zoom);
  }

  render() {
    const { w, h } = labelDots(this.doc);
    draw(this.label, this.doc, { skip: this.editingId });
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
    const S = this.scale;
    s.width = w * S;
    s.height = h * S;
    s.style.aspectRatio = `${w} / ${h}`;
    const ctx = s.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.label, 0, 0, s.width, s.height);

    ctx.strokeStyle = '#e14b3b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    for (const g of this.guides) {
      ctx.beginPath();
      if (g.axis === 'x') { ctx.moveTo(g.at * S, 0); ctx.lineTo(g.at * S, s.height); }
      else { ctx.moveTo(0, g.at * S); ctx.lineTo(s.width, g.at * S); }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const el = this.selected;
    if (el) {
      ctx.lineWidth = 2;
      ctx.strokeRect(el.x * S, el.y * S, el.w * S, el.h * S);
      ctx.fillStyle = '#e14b3b';
      ctx.beginPath();
      ctx.arc((el.x + el.w) * S, (el.y + el.h) * S, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    this.placeTyper();
  }

  // ---- pointer interaction ----
  toDots(e) {
    const r = this.stage.getBoundingClientRect();
    const { w, h } = labelDots(this.doc);
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h, perDot: r.width / w };
  }

  down(e) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { this.stage.setPointerCapture(e.pointerId); } catch {} // keeps the drag going outside the canvas
    if (this.pointers.size === 2) {
      // A second finger turns any drag into a pinch-zoom.
      if (this.drag?.el) Object.assign(this.drag.el, this.drag.orig);
      const [a, b] = [...this.pointers.values()];
      this.drag = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
      this.guides = [];
      this.render();
      return;
    }
    if (this.editingId) {
      // Tapping the label finishes typing. Done directly too, because blur doesn't always fire.
      this.stopTyping();
      this.typer.blur();
    }
    const p = this.toDots(e);
    const sel = this.selected;
    const grab = 16 / p.perDot; // handle radius in dots
    const slop = 6 / p.perDot; // extra margin so thin elements are easy to tap
    const inside = (el, m) => p.x >= el.x - m && p.x <= el.x + el.w + m && p.y >= el.y - m && p.y <= el.y + el.h + m;
    const order = [...this.doc.elements].reverse();
    // Prefer the element actually under the finger, then one just next to it.
    const hit = order.find((el) => inside(el, 0)) ?? order.find((el) => inside(el, slop));
    if (sel && Math.hypot(p.x - (sel.x + sel.w), p.y - (sel.y + sel.h)) < grab) {
      this.drag = { mode: 'resize', el: sel, start: p, orig: { ...sel } };
    } else {
      const wasSelected = !!hit && hit.id === this.selectedId;
      this.selectedId = hit?.id ?? null;
      this.renderInspector();
      this.drag = hit
        ? { mode: 'move', el: hit, start: p, orig: { ...hit }, wasSelected }
        : { mode: 'pan', x: e.clientX, scroll: this.wrap.scrollLeft }; // empty space scrolls a zoomed label
    }
    this.render();
  }

  move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.drag) return;
    const { el, start, orig, mode } = this.drag;
    if (mode === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const mid = (a.x + b.x) / 2 - this.wrap.getBoundingClientRect().left;
      this.setZoom((this.drag.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / this.drag.dist, mid);
      return;
    }
    if (mode === 'pan') {
      this.wrap.scrollLeft = this.drag.scroll - (e.clientX - this.drag.x);
      return;
    }
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
      el.auto = false; // a hand-sized box keeps its size; the font shrinks to fit it
      el.w = Math.max(MIN, Math.round(orig.w + dx));
      el.h = Math.max(el.type === 'line' ? 1 : MIN, Math.round(orig.h + dy));
      if (el.type === 'qr' || el.type === 'icon') el.w = el.h = Math.max(el.w, el.h);
    }
    this.render();
  }

  up(e) {
    this.pointers.delete(e.pointerId);
    if (!this.drag) return;
    if (this.drag.mode === 'pinch') {
      if (!this.pointers.size) this.drag = null;
      return;
    }
    const { mode, el, orig, wasSelected } = this.drag;
    this.drag = null;
    this.guides = [];
    // Tapping (not dragging) a text that was already selected starts typing on it.
    if (mode === 'move' && wasSelected && el.type === 'text' && el.x === orig.x && el.y === orig.y) {
      this.startTyping(el);
      return;
    }
    this.render();
    if (mode === 'move' || mode === 'resize') {
      this.commit();
      this.renderInspector();
    }
  }

  // ---- element commands ----
  async add(type, init = {}) {
    if (type === 'text') this.beginTyping(); // must happen before the first await (see beginTyping)
    const el = { ...newElement(type, this.doc), ...init };
    // Extra texts start smaller so they fit beside what's already there.
    if (type === 'text' && !('size' in init) && this.doc.elements.some((o) => o.type === 'text' || o.type === 'date')) el.size = 24;
    if ('w' in init) el.auto = init.auto ?? false; // explicit geometry wins over auto-sizing
    this.doc.elements.push(el);
    this.selectedId = el.id;
    await prepare(this.doc);
    this.fitBox(el);
    if (!('x' in init)) this.place(el);
    await this.refresh();
    this.commit();
    if (type === 'text' && !('w' in init)) {
      this.newTextId = el.id; // re-placed once its real size is known (see stopTyping)
      this.startTyping(el, { selectAll: true });
    }
    return el;
  }
  update(changes, { commit = false } = {}) {
    const el = this.selected;
    Object.assign(el, changes);
    prepare(this.doc).then(() => {
      this.fitBox(el);
      this.render();
      if (commit) this.commit();
    });
  }

  // Auto-sized text boxes hug their text, growing around their centre and staying on the label.
  // Once the text is wider than the label, the font shrinks instead (see drawText).
  fitBox(el) {
    if (!el.auto) return;
    const { w, h } = labelDots(this.doc);
    const m = measureText(el, elementText(el));
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    el.w = Math.max(MIN, Math.min(w, m.w));
    el.h = Math.max(MIN, Math.min(h, m.h));
    el.x = Math.round(Math.min(Math.max(0, cx - el.w / 2), w - el.w));
    el.y = Math.round(Math.min(Math.max(0, cy - el.h / 2), h - el.h));
  }

  // Put a new element where it overlaps existing ones the least, preferring the centre.
  place(el) {
    const { w, h } = labelDots(this.doc);
    const others = this.doc.elements.filter((o) => o !== el && o.type !== 'border');
    const overlap = (x, y) => others.reduce((sum, o) => {
      const ox = Math.min(x + el.w, o.x + o.w) - Math.max(x, o.x);
      const oy = Math.min(y + el.h, o.y + o.h) - Math.max(y, o.y);
      return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0);
    let best = null;
    for (let y = 0; y <= h - el.h; y += 2) {
      for (let x = 0; x <= w - el.w; x += 4) {
        const score = overlap(x, y) * 100 + Math.hypot(x + el.w / 2 - w / 2, y + el.h / 2 - h / 2);
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    el.x = best?.x ?? 0;
    el.y = best?.y ?? 0;
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
    if (where === 'left') el.x = 0;
    if (where === 'right') el.x = w - el.w;
    if (where === 'top') el.y = 0;
    if (where === 'bottom') el.y = h - el.h;
    if (where === 'h') el.x = Math.round((w - el.w) / 2);
    if (where === 'v') el.y = Math.round((h - el.h) / 2);
    if (where === 'fill') Object.assign(el, { x: 4, y: 4, w: w - 8, h: h - 8, auto: false }); // keep the stretched box
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
      box.innerHTML = '<p class="hint">Tap something on the label to select it, then drag to move it. Tap a selected text again to type. Pinch or use − / + to zoom.</p>';
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    // Icon buttons in groups: position, size, layering, then copy/delete.
    const groups = [
      [['left', 'Move to the left edge', () => this.alignTo('left')],
        ['centerH', 'Center horizontally', () => this.alignTo('h')],
        ['right', 'Move to the right edge', () => this.alignTo('right')]],
      [['top', 'Move to the top edge', () => this.alignTo('top')],
        ['centerV', 'Center vertically', () => this.alignTo('v')],
        ['bottom', 'Move to the bottom edge', () => this.alignTo('bottom')]],
      [['fill', 'Fill the label', () => this.alignTo('fill')]],
      [['front', 'Bring to front', () => this.reorder(true)],
        ['back', 'Send to back', () => this.reorder(false)]],
      [['duplicate', 'Duplicate', () => this.duplicate()],
        ['delete', 'Delete', () => this.remove()]],
    ];
    // One row: buttons share the width equally, with thin dividers between groups.
    for (const [i, group] of groups.entries()) {
      if (i) actions.append(Object.assign(document.createElement('span'), { className: 'action-sep' }));
      for (const [icon, title, fn] of group) {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title);
        b.innerHTML = ACTION_ICONS[icon];
        b.onclick = fn;
        if (icon === 'delete') b.classList.add('danger');
        actions.append(b);
      }
    }
    box.append(actions);

    const grid = document.createElement('div');
    grid.className = 'fields';
    for (const f of FIELDS[el.type]) grid.append(this.field(el, f));
    box.append(grid);
  }

  field(el, f) {
    // Pickers made of many buttons can't sit inside a <label>: a tap on empty space would press the first button.
    const wrap = document.createElement(['fonts', 'segments', 'toggles'].includes(f.kind) ? 'div' : 'label');
    wrap.className = `field field-${f.kind}`;
    const name = document.createElement('span');
    name.textContent = f.label;
    let input;

    switch (f.kind) {
      case 'typing':
        input = this.captureTools(el);
        break;
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
      case 'slider': {
        // The label redraws while dragging; the change goes into undo history on release.
        const range = document.createElement('input');
        range.type = 'range';
        Object.assign(range, { min: f.min, max: f.max, step: f.step ?? 1, value: el[f.key] });
        const out = document.createElement('output');
        const show = (v) => { out.textContent = f.format ? f.format(v) : v; };
        show(el[f.key]);
        range.oninput = () => {
          show(Number(range.value));
          this.update({ [f.key]: Number(range.value) });
        };
        range.onchange = () => this.update({ [f.key]: Number(range.value) }, { commit: true });
        input = document.createElement('div');
        input.className = 'slider';
        input.append(range, out);
        break;
      }
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
      case 'segments':
        // A row of icon buttons, one per option; the current one is highlighted.
        input = document.createElement('div');
        input.className = 'segments';
        for (const [value, title, icon] of f.options) {
          const b = document.createElement('button');
          b.type = 'button';
          b.title = title;
          b.setAttribute('aria-label', title);
          b.setAttribute('aria-pressed', value === el[f.key]);
          b.innerHTML = icon;
          b.onclick = () => {
            this.update({ [f.key]: value }, { commit: true });
            for (const other of input.children) other.setAttribute('aria-pressed', other === b);
          };
          input.append(b);
        }
        break;
      case 'toggles':
        // On/off icon buttons, each switching its own setting (e.g. bold, italic).
        input = document.createElement('div');
        input.className = 'segments toggles';
        for (const [key, title, icon] of f.options) {
          const b = document.createElement('button');
          b.type = 'button';
          b.title = title;
          b.setAttribute('aria-label', title);
          b.setAttribute('aria-pressed', !!el[key]);
          b.innerHTML = icon;
          b.onclick = () => {
            const on = !el[key];
            this.update({ [key]: on }, { commit: true });
            b.setAttribute('aria-pressed', on);
          };
          input.append(b);
        }
        break;
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
      case 'fonts':
        input = this.fontPicker(el);
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
    if (f.key === 'value') {
      const tools = this.captureTools(el);
      if (tools) wrap.append(tools);
    }
    return wrap;
  }

  // Font picker: the current font as a button that opens a searchable list, each name shown in its own font.
  fontPicker(el) {
    const box = document.createElement('div');
    box.className = 'font-picker';
    const current = FONTS.find((f) => f.css === el.font) ?? { name: 'Custom', css: el.font };
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'font-current';
    toggle.textContent = `${current.name} ▾`;
    loadFont(current.css).then(() => { toggle.style.fontFamily = current.css; });

    const panel = document.createElement('div');
    panel.className = 'font-panel';
    panel.hidden = true;
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = `Search ${FONTS.length} fonts`;
    const list = document.createElement('div');
    list.className = 'font-list';
    panel.append(search, list);

    // Only fetch a font once its row scrolls into view.
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const b = e.target;
        seen.unobserve(b);
        loadFont(b.dataset.css).then(() => { b.style.fontFamily = b.dataset.css; });
      }
    }, { root: list, rootMargin: '200px' });

    for (const [cat, title] of FONT_CATEGORIES) {
      const h = document.createElement('h4');
      h.textContent = title;
      list.append(h);
      for (const font of FONTS.filter((x) => x.category === cat)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = font.name;
        b.dataset.css = font.css;
        b.dataset.name = font.name.toLowerCase();
        if (font.css === el.font) b.classList.add('on');
        b.onclick = () => {
          this.update({ font: font.css }, { commit: true });
          seen.disconnect();
          this.renderInspector();
        };
        list.append(b);
      }
    }
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      for (const b of list.querySelectorAll('button')) b.hidden = q && !b.dataset.name.includes(q);
      // Hide a category heading when nothing under it matches.
      for (const h of list.querySelectorAll('h4')) {
        let n = h.nextElementSibling, any = false;
        for (; n && n.tagName === 'BUTTON'; n = n.nextElementSibling) any ||= !n.hidden;
        h.hidden = !any;
      }
    };
    toggle.onclick = () => {
      panel.hidden = !panel.hidden;
      if (panel.hidden) return;
      for (const b of list.querySelectorAll('button')) if (!b.style.fontFamily) seen.observe(b);
      const on = list.querySelector('.on'); // scroll just the list (scrollIntoView would move the page too)
      if (on) list.scrollTop = on.offsetTop - list.clientHeight / 2;
    };
    box.append(toggle, panel);
    return box;
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
            this.fitBox(target);
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
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = '✎ Type on label';
      edit.onclick = (e) => { e.preventDefault(); this.startTyping(el); };
      tools.append(edit);
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
