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

// Fonts. System fonts need no download; the rest are free Google Fonts, fetched
// only when a label uses one or the font picker shows it (see fonts.js).
// Web font entries are 'Family' or 'Family:weights'. Weights were checked against Google Fonts.
const WEB_FONTS = {
  sans: 'Roboto:400;700;900|Open Sans:400;700;800|Lato:400;700;900|Montserrat:400;700;900|Poppins:400;700;900|Inter:400;700;900|Raleway:400;700;900|Nunito:400;700;900|Work Sans:400;700;900|Rubik:400;700;900|Barlow:400;700;900|Barlow Condensed:400;700;900|Roboto Condensed:400;700;900|Archivo:400;700;900|Archivo Black|Oswald:400;700|Bebas Neue|Anton|Fredoka:400;700|Quicksand:400;700|Josefin Sans:400;700|Kanit:400;700;900|Titillium Web:400;700;900|Exo 2:400;700;900|Ubuntu:400;700|PT Sans:400;700|Source Sans 3:400;700;900|DM Sans:400;700;900|Manrope:400;800|League Spartan:400;700;900|Fjalla One|Teko:400;700|Russo One|Passion One:400;700;900|Varela Round|Comfortaa:400;700|Mulish:400;700;900|Outfit:400;700;900|Lexend:400;700;900',
  serif: 'Roboto Slab:400;700;900|Merriweather:400;700;900|Playfair Display:400;700;900|Lora:400;700|PT Serif:400;700|Libre Baskerville:400;700|Zilla Slab:400;700|Bitter:400;700;900|Crimson Text:400;700|EB Garamond:400;700|Abril Fatface|DM Serif Display|Cinzel:400;700;900|Alfa Slab One|Arvo:400;700',
  script: 'Pacifico|Lobster|Dancing Script:400;700|Great Vibes|Satisfy|Caveat:400;700|Kaushan Script|Permanent Marker|Shadows Into Light|Indie Flower|Amatic SC:400;700|Sacramento|Yellowtail|Courgette|Cookie|Gloria Hallelujah|Patrick Hand|Architects Daughter|Homemade Apple|Allura',
  display: 'Bungee|Monoton|Press Start 2P|Bangers|Luckiest Guy|Creepster|Special Elite|Staatliches|Rye|Chewy|Lilita One|Titan One|Carter One|Fugaz One|Audiowide|Orbitron:400;700;900|Righteous|Black Ops One|Bowlby One SC|Ultra|Shrikhand',
  mono: 'Roboto Mono:400;700|Space Mono:400;700|Courier Prime:400;700|Source Code Pro:400;700;900|IBM Plex Mono:400;700|JetBrains Mono:400;800',
};
const GENERIC = { sans: 'sans-serif', serif: 'serif', script: 'cursive', display: 'sans-serif', mono: 'monospace' };
export const FONT_CATEGORIES = [
  ['system', 'On this device'], ['sans', 'Sans serif'], ['serif', 'Serif'],
  ['script', 'Script & handwriting'], ['display', 'Display'], ['mono', 'Monospace'],
];

export const FONTS = [
  { name: 'System', css: 'system-ui, -apple-system, sans-serif', category: 'system' },
  { name: 'Arial Black', css: '"Arial Black", Arial, sans-serif', category: 'system' },
  { name: 'Helvetica', css: 'Helvetica, Arial, sans-serif', category: 'system' },
  { name: 'Georgia', css: 'Georgia, serif', category: 'system' },
  { name: 'Courier', css: '"Courier New", monospace', category: 'system' },
  ...Object.entries(WEB_FONTS).flatMap(([category, list]) => list.split('|').map((entry) => {
    const [family, weights = '400'] = entry.split(':');
    return { name: family, css: `"${family}", ${GENERIC[category]}`, category, web: { family, weights } };
  })),
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
  auto: true, // box follows the text; turned off when the box is resized by hand
  font: FONTS[0].css, size: 40, bold: true, italic: false, underline: false,
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
  settings() {
    const saved = read('printSettings', {});
    // v2 flipped the default print orientation, so a Rotate 180° ticked before then no longer applies.
    if (saved.v !== 2) delete saved.rotate180;
    return { copies: 1, offsetX: 0, offsetY: 0, mirror: false, rotate180: false, density: 0, ...saved };
  },
  saveSettings: (s) => write('printSettings', { ...s, v: 2 }),
  // Icons the user uploaded: [{ id, name, svg }] or [{ id, name, img }] (a PNG data URL).
  myIcons: () => read('myIcons', []),
  saveMyIcons: (list) => write('myIcons', list),
  // Which density command the printer obeys, chosen on test.html (null until confirmed).
  densityMethod: () => read('densityMethod', null),
  saveDensityMethod: (m) => write('densityMethod', m),
};
