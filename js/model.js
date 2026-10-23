// Label documents, element defaults and local storage.
// All element geometry is in printer dots (8 dots per mm); the printable
// height is always the 96-dot head width.

export const DPM = 8;
export const HEAD_DOTS = 96;

// D30 label stock (from the sizes the official app offers).
export const SIZES = [
  [12, 22], [12, 30], [12, 40], [12, 50], [12.5, 74],
  [14, 25], [14, 28], [14, 30], [14, 40], [14, 50], [14, 60], [14, 74],
].map(([tape, length]) => ({ id: `${tape}x${length}`, tape, length, name: `${tape}×${length} mm` }));

export const FONTS = [
  { name: 'System', css: 'system-ui, -apple-system, sans-serif' },
  { name: 'Arial Black', css: '"Arial Black", Arial, sans-serif' },
  { name: 'Oswald', css: '"Oswald", sans-serif', web: true },
  { name: 'Bebas Neue', css: '"Bebas Neue", sans-serif', web: true },
  { name: 'Anton', css: '"Anton", sans-serif', web: true },
  { name: 'Archivo Black', css: '"Archivo Black", sans-serif', web: true },
  { name: 'Fredoka', css: '"Fredoka", sans-serif', web: true },
  { name: 'Roboto Slab', css: '"Roboto Slab", serif', web: true },
  { name: 'Permanent Marker', css: '"Permanent Marker", cursive', web: true },
  { name: 'Pacifico', css: '"Pacifico", cursive', web: true },
  { name: 'Lobster', css: '"Lobster", cursive', web: true },
  { name: 'Georgia', css: 'Georgia, serif' },
  { name: 'Courier', css: '"Courier New", monospace' },
];

export const uid = () => Math.random().toString(36).slice(2, 10);

export function labelDots(doc) {
  return { w: Math.round(doc.lengthMM * DPM), h: HEAD_DOTS };
}

export function newDoc(sizeId = '12x40') {
  const s = SIZES.find((x) => x.id === sizeId) ?? SIZES[2];
  return { id: uid(), name: 'Untitled', sizeId: s.id, lengthMM: s.length, elements: [], updated: Date.now() };
}

const textStyle = {
  font: FONTS[0].css, size: 48, bold: true, italic: false, underline: false,
  align: 'center', letterSpacing: 0, lineSpacing: 1.1, reverse: false,
};

// Default element of each type, placed relative to the label size.
export function newElement(type, doc) {
  const { w, h } = labelDots(doc);
  const base = { id: uid(), type };
  switch (type) {
    case 'text':
      return { ...base, ...textStyle, x: 8, y: 8, w: w - 16, h: h - 16, text: 'Text' };
    case 'date':
      return { ...base, ...textStyle, size: 40, x: 8, y: 8, w: w - 16, h: h - 16, prefix: 'EXP: ', format: 'MM/DD/YYYY', offsetDays: 0 };
    case 'border':
      return { ...base, x: 2, y: 2, w: w - 4, h: h - 4, style: 'rounded', stroke: 3 };
    case 'shape':
      return { ...base, x: w / 2 - 30, y: h / 2 - 30, w: 60, h: 60, shape: 'rect', fill: false, stroke: 3 };
    case 'line':
      return { ...base, x: 8, y: h / 2 - 2, w: w - 16, h: 4, dashed: false };
    case 'barcode':
      return { ...base, x: 8, y: 8, w: w - 16, h: h - 16, format: 'CODE128', value: '12345678', showText: true };
    case 'qr':
      return { ...base, x: 4, y: 4, w: h - 8, h: h - 8, value: 'https://example.com' };
    case 'image':
      return { ...base, x: 4, y: 4, w: h - 8, h: h - 8, src: '', dither: true, invert: false };
    case 'icon':
      return { ...base, x: 4, y: 4, w: h - 8, h: h - 8, icon: 'heart' };
    default:
      throw new Error(`Unknown element type ${type}`);
  }
}

// ---- storage (this browser only) ----

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota exceeded (large images) or storage blocked
  }
};

export const store = {
  labels: () => read('labels', []),
  saveLabel(doc, thumb) {
    const labels = this.labels().filter((l) => l.doc.id !== doc.id);
    labels.unshift({ doc: { ...doc, updated: Date.now() }, thumb });
    return write('labels', labels);
  },
  deleteLabel(id) {
    write('labels', this.labels().filter((l) => l.doc.id !== id));
  },
  history: () => read('history', []),
  addHistory(doc, thumb) {
    const h = this.history();
    h.unshift({ doc, thumb, printed: Date.now() });
    write('history', h.slice(0, 50));
  },
  settings: () => ({ copies: 1, offsetX: 0, offsetY: 0, mirror: false, rotate180: false, density: 0, ...read('printSettings', {}) }),
  saveSettings: (s) => write('printSettings', s),
  // Which density command the printer obeys, chosen on test.html (null until confirmed).
  densityMethod: () => read('densityMethod', null),
  saveDensityMethod: (m) => write('densityMethod', m),
};
