// Draws a label document onto a canvas at printer resolution (1 px = 1 dot).
// Call prepare(doc) first so fonts and images are loaded; draw() is then
// synchronous and fast enough to run on every drag event.

import { labelDots } from './model.js';
import { drawIcon } from './icons.js';
import { drawBorderDesign } from './borders.js';
import { loadFont } from './fonts.js';

const images = new Map(); // src -> HTMLImageElement
const ditherCache = new Map(); // key -> canvas

export async function prepare(doc) {
  const jobs = [];
  for (const el of doc.elements) {
    if (el.font) jobs.push(loadFont(el.font).then(() => document.fonts.load(`${el.bold ? 800 : 400} 40px ${el.font}`)).catch(() => {}));
    const iconSrc = el.type === 'icon' && iconImageSrc(el);
    if (iconSrc && !images.has(iconSrc)) {
      const img = new Image();
      images.set(iconSrc, img);
      jobs.push(new Promise((res) => { img.onload = img.onerror = res; img.src = iconSrc; }));
    }
    if (el.type === 'image' && el.src && !images.has(el.src)) {
      const img = new Image();
      images.set(el.src, img);
      jobs.push(new Promise((res) => { img.onload = img.onerror = res; img.src = el.src; }));
    }
  }
  await Promise.all(jobs);
}

const svgSrc = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// Library and uploaded icons carry their own picture (SVG text or a PNG data URL);
// the classic ones are drawn from icons.js.
const iconImageSrc = (el) => (el.svg ? svgSrc(el.svg) : el.img || null);

function drawIconElement(ctx, el) {
  const src = iconImageSrc(el);
  if (!src) return drawIcon(ctx, el.icon, el.x, el.y, el.w, el.h);
  const img = images.get(src);
  if (!img?.naturalWidth) return;
  const s = Math.min(el.w / img.naturalWidth, el.h / img.naturalHeight); // fit inside the box, keep its shape
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, el.x + (el.w - dw) / 2, el.y + (el.h - dh) / 2, dw, dh);
}

export function formatDate(el, now = new Date()) {
  const d = new Date(now.getTime() + el.offsetDays * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = { YYYY: d.getFullYear(), MM: pad(d.getMonth() + 1), DD: pad(d.getDate()), MMM: months[d.getMonth()] };
  return el.prefix + el.format.replace(/YYYY|MMM|MM|DD/g, (t) => parts[t]);
}

export const elementText = (el) => (el.type === 'date' ? formatDate(el) : el.text);

export const fontCSS = (el, size) => `${el.italic ? 'italic ' : ''}${el.bold ? 800 : 400} ${size}px ${el.font}`;

let measureCtx;

// ---- text layout ----
// Text is laid out as glyphs (whole lines for straight text, single letters otherwise), each
// with a centre, an angle and a vertical stretch. A shape (arch, wave…) bends that layout and
// rotate turns it as a whole; the box the text needs is the bounding box of every glyph.
export const TEXT_SHAPES = ['none', 'arch', 'arch-down', 'circle', 'wave', 'bulge', 'pinch', 'vertical'];
export const isStraightText = (el) => (el.warp ?? 'none') === 'none' && !el.rotate;

function layoutText(el, text, size) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const ctx = measureCtx;
  ctx.font = fontCSS(el, size);
  const spaced = 'letterSpacing' in ctx;
  const warp = el.warp ?? 'none';
  const lines = text.split('\n');
  const n = lines.length;
  const lineH = size * el.lineSpacing;
  const glyphs = [];
  const charW = (ch) => ctx.measureText(ch).width + el.letterSpacing;
  if (spaced) ctx.letterSpacing = '0px';

  if (warp === 'none') {
    if (spaced) ctx.letterSpacing = `${el.letterSpacing}px`;
    const widths = lines.map((l) => ctx.measureText(l).width);
    const W = Math.max(...widths);
    lines.forEach((line, i) => {
      const start = el.align === 'left' ? -W / 2 : el.align === 'right' ? W / 2 - widths[i] : -widths[i] / 2;
      glyphs.push({ text: line, x: start + widths[i] / 2, y: (i - (n - 1) / 2) * lineH, a: 0, sy: 1, w: widths[i], spaced: true });
    });
  } else if (warp === 'vertical') {
    // Letters stacked top to bottom; each line becomes a column. Align moves them up or down.
    const step = size * 0.92 + el.letterSpacing;
    const most = Math.max(...lines.map((l) => [...l].length));
    lines.forEach((line, i) => {
      const chars = [...line];
      const off = el.align === 'left' ? 0 : el.align === 'right' ? most - chars.length : (most - chars.length) / 2;
      chars.forEach((ch, j) => glyphs.push({ text: ch, x: (i - (n - 1) / 2) * lineH, y: (off + j - (most - 1) / 2) * step, a: 0, sy: 1, w: charW(ch), h: step }));
    });
  } else {
    const widths = lines.map((l) => [...l].reduce((sum, ch) => sum + charW(ch), 0));
    const W = Math.max(1, ...widths);
    const c = (el.curve ?? 50) / 100;
    // Arches: the widest line bends through up to 324° (a full circle for "circle").
    const sweep = warp === 'circle' ? Math.PI * 2 * 0.94 : Math.max(0.05, c * Math.PI * 1.8);
    const R = W / sweep;
    lines.forEach((line, i) => {
      const y = (i - (n - 1) / 2) * lineH;
      let x = el.align === 'left' ? -W / 2 : el.align === 'right' ? W / 2 - widths[i] : -widths[i] / 2;
      for (const ch of line) {
        const w = charW(ch), cx = x + w / 2;
        x += w;
        if (warp === 'arch' || warp === 'circle') {
          const r = R - y, f = cx / r;
          glyphs.push({ text: ch, x: r * Math.sin(f), y: R - r * Math.cos(f), a: f, sy: 1, w });
        } else if (warp === 'arch-down') {
          const r = R + y, f = cx / r;
          glyphs.push({ text: ch, x: r * Math.sin(f), y: r * Math.cos(f) - R, a: -f, sy: 1, w });
        } else if (warp === 'wave') {
          const A = c * size * 0.6, k = (Math.PI * 2 * 1.5) / W;
          glyphs.push({ text: ch, x: cx, y: y + A * Math.sin(k * cx), a: Math.atan(A * k * Math.cos(k * cx)), sy: 1, w });
        } else {
          const t = Math.cos((Math.PI * cx) / W); // 1 in the middle, 0 at the ends
          const sy = warp === 'bulge' ? 1 + 1.6 * c * t : 1 + 1.6 * c * (1 - t);
          glyphs.push({ text: ch, x: cx, y, a: 0, sy, w });
        }
      }
    });
  }

  // Bounding box after turning the whole text by el.rotate.
  const rot = ((el.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of glyphs) {
    const hw = g.w / 2, hh = ((g.h ?? size) * g.sy) / 2;
    const ca = Math.cos(g.a), sa = Math.sin(g.a);
    for (const [px, py] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
      const gx = g.x + px * ca - py * sa, gy = g.y + px * sa + py * ca;
      const X = gx * cos - gy * sin, Y = gx * sin + gy * cos;
      minX = Math.min(minX, X); maxX = Math.max(maxX, X);
      minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
    }
  }
  if (!glyphs.length) minX = maxX = minY = maxY = 0;
  if (spaced) ctx.letterSpacing = '0px';
  return { glyphs, size, rot, minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

// The box a text element needs to show its text at full font size.
export function measureText(el, text) {
  const pad = el.reverse ? 4 : 0;
  const L = layoutText(el, text, el.size);
  return { w: Math.ceil(L.w + pad * 2 + 4), h: Math.ceil(L.h + pad * 2 + 2) };
}

// The layout at the largest font size (up to el.size) at which the text fits its box.
function fitLayout(el, text) {
  const pad = el.reverse ? 4 : 0;
  const fits = (L) => L.w <= el.w - pad * 2 && L.h <= el.h - pad * 2;
  let L = layoutText(el, text, el.size);
  if (fits(L) || el.size <= 6) return L;
  // Text grows roughly in proportion to its size, so start from the estimate and adjust.
  let size = Math.max(6, Math.min(el.size - 1, Math.floor(el.size * Math.min((el.w - pad * 2) / L.w, (el.h - pad * 2) / L.h))));
  L = layoutText(el, text, size);
  while (size > 6 && !fits(L)) L = layoutText(el, text, --size);
  while (size < el.size - 1 && fits(L)) {
    const bigger = layoutText(el, text, size + 1);
    if (!fits(bigger)) break;
    L = bigger;
    size++;
  }
  return L;
}

export const fitFontSize = (el, text) => fitLayout(el, text).size;

function drawText(ctx, el, text) {
  const pad = el.reverse ? 4 : 0;
  if (el.reverse) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.w, el.h, 4);
    ctx.fill();
  }
  const L = fitLayout(el, text);
  const size = L.size;
  ctx.fillStyle = el.reverse ? '#fff' : '#000';
  ctx.textBaseline = 'middle';
  ctx.font = fontCSS(el, size);

  // Place the text's bounding box in the element box: centred, or against the side it is aligned to.
  let ox = el.x + el.w / 2 - (L.minX + L.maxX) / 2;
  if ((el.warp ?? 'none') !== 'vertical') {
    if (el.align === 'left') ox = el.x + pad - L.minX;
    else if (el.align === 'right') ox = el.x + el.w - pad - L.maxX;
  }
  const oy = el.y + el.h / 2 - (L.minY + L.maxY) / 2;
  for (const g of L.glyphs) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(L.rot);
    ctx.translate(g.x, g.y);
    ctx.rotate(g.a);
    if (g.sy !== 1) ctx.scale(1, g.sy);
    if ('letterSpacing' in ctx) ctx.letterSpacing = g.spaced ? `${el.letterSpacing}px` : '0px';
    ctx.fillText(g.text, -g.w / 2 + (g.spaced ? 0 : el.letterSpacing / 2), 0);
    if (el.underline) ctx.fillRect(-g.w / 2, size * 0.45, g.w, Math.max(2, size / 14));
    ctx.restore();
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function drawShape(ctx, el) {
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.lineWidth = el.stroke;
  const o = el.fill ? 0 : el.stroke / 2;
  ctx.beginPath();
  if (el.shape === 'ellipse') ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2 - o, el.h / 2 - o, 0, 0, Math.PI * 2);
  else ctx.roundRect(el.x + o, el.y + o, el.w - 2 * o, el.h - 2 * o, el.shape === 'rounded' ? Math.min(el.w, el.h) / 4 : 0);
  el.fill ? ctx.fill() : ctx.stroke();
}

function drawLine(ctx, el) {
  ctx.fillStyle = '#000';
  if (!el.dashed) return ctx.fillRect(el.x, el.y, el.w, el.h);
  const dash = Math.max(el.h * 3, 6);
  for (let x = el.x; x < el.x + el.w; x += dash * 2) ctx.fillRect(x, el.y, Math.min(dash, el.x + el.w - x), el.h);
}

function drawBarcode(ctx, el) {
  if (!window.JsBarcode || !el.value) return;
  const textH = el.showText ? Math.min(18, el.h / 3) : 0;
  const opts = { format: el.format, displayValue: false, margin: 0, height: Math.max(8, el.h - textH), background: '#fff', lineColor: '#000' };
  try {
    // Render once at 1 dot per module to count modules, then at the largest whole multiple that fits.
    const probe = document.createElement('canvas');
    window.JsBarcode(probe, el.value, { ...opts, width: 1 });
    const width = Math.max(1, Math.floor(el.w / probe.width));
    const bc = document.createElement('canvas');
    window.JsBarcode(bc, el.value, { ...opts, width });
    const x = el.x + Math.floor((el.w - bc.width) / 2);
    ctx.drawImage(bc, x, el.y);
    if (el.showText) {
      ctx.fillStyle = '#000';
      ctx.font = `600 ${textH}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(el.value, el.x + el.w / 2, el.y + el.h);
      ctx.textAlign = 'left';
    }
  } catch {
    ctx.fillStyle = '#000';
    ctx.font = '600 14px system-ui';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Invalid ${el.format}`, el.x + 4, el.y + el.h / 2);
  }
}

function drawQR(ctx, el) {
  if (!window.qrcode || !el.value) return;
  const qr = window.qrcode(0, 'M');
  qr.addData(el.value);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.max(1, Math.floor(Math.min(el.w, el.h) / n));
  const ox = el.x + Math.floor((el.w - n * cell) / 2);
  const oy = el.y + Math.floor((el.h - n * cell) / 2);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
}

// Photos are converted to pure black/white with Floyd–Steinberg dithering.
function drawImage(ctx, el) {
  const img = images.get(el.src);
  if (!img?.naturalWidth) return;
  const w = Math.max(1, Math.round(el.w));
  const h = Math.max(1, Math.round(el.h));
  const key = `${el.src.length}:${el.src.slice(-32)}:${w}:${h}:${el.dither}:${el.invert}`;
  let out = ditherCache.get(key);
  if (!out) {
    out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const c = out.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, w, h);
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const data = c.getImageData(0, 0, w, h);
    const px = data.data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      g[i] = el.invert ? 255 - v : v;
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = g[i] < 128 ? 0 : 255;
        if (el.dither) {
          const err = g[i] - v;
          if (x + 1 < w) g[i + 1] += (err * 7) / 16;
          if (y + 1 < h) {
            if (x > 0) g[i + w - 1] += (err * 3) / 16;
            g[i + w] += (err * 5) / 16;
            if (x + 1 < w) g[i + w + 1] += err / 16;
          }
        }
        px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
        px[i * 4 + 3] = 255;
      }
    }
    c.putImageData(data, 0, 0);
    ditherCache.set(key, out);
  }
  ctx.drawImage(out, Math.round(el.x), Math.round(el.y));
}

export function drawElement(ctx, el) {
  ctx.save();
  switch (el.type) {
    case 'text': drawText(ctx, el, el.text); break;
    case 'date': drawText(ctx, el, formatDate(el)); break;
    case 'border': drawBorderDesign(ctx, el); break;
    case 'shape': drawShape(ctx, el); break;
    case 'line': drawLine(ctx, el); break;
    case 'barcode': drawBarcode(ctx, el); break;
    case 'qr': drawQR(ctx, el); break;
    case 'image': drawImage(ctx, el); break;
    case 'icon': drawIconElement(ctx, el); break;
  }
  ctx.restore();
}

// Draw the whole label. offset shifts everything (print calibration), in dots.
// skip: id of an element not to draw (the editor hides text that is being typed over).
export function draw(canvas, doc, { offset = { x: 0, y: 0 }, skip = null } = {}) {
  const { w, h } = labelDots(doc);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(offset.x, offset.y);
  for (const el of doc.elements) if (el.id !== skip) drawElement(ctx, el);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

export async function renderToCanvas(doc, opts) {
  await prepare(doc);
  return draw(document.createElement('canvas'), doc, opts);
}

export async function thumbnail(doc) {
  const c = await renderToCanvas(doc);
  return c.toDataURL('image/png');
}
