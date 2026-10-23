// Draws a label document onto a canvas at printer resolution (1 px = 1 dot).
// Call prepare(doc) first so fonts and images are loaded; draw() is then
// synchronous and fast enough to run on every drag event.

import { labelDots } from './model.js';
import { drawIcon } from './icons.js';

const images = new Map(); // src -> HTMLImageElement
const ditherCache = new Map(); // key -> canvas

export async function prepare(doc) {
  const jobs = [];
  for (const el of doc.elements) {
    if (el.font) jobs.push(document.fonts.load(`${el.bold ? 800 : 400} 40px ${el.font}`).catch(() => {}));
    if (el.type === 'image' && el.src && !images.has(el.src)) {
      const img = new Image();
      images.set(el.src, img);
      jobs.push(new Promise((res) => { img.onload = img.onerror = res; img.src = el.src; }));
    }
  }
  await Promise.all(jobs);
}

export function formatDate(el, now = new Date()) {
  const d = new Date(now.getTime() + el.offsetDays * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = { YYYY: d.getFullYear(), MM: pad(d.getMonth() + 1), DD: pad(d.getDate()), MMM: months[d.getMonth()] };
  return el.prefix + el.format.replace(/YYYY|MMM|MM|DD/g, (t) => parts[t]);
}

function drawText(ctx, el, text) {
  const lines = text.split('\n');
  const pad = el.reverse ? 4 : 0;
  const boxW = el.w - pad * 2;
  const boxH = el.h - pad * 2;
  const font = (size) => `${el.italic ? 'italic ' : ''}${el.bold ? 800 : 400} ${size}px ${el.font}`;

  if (el.reverse) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.w, el.h, 4);
    ctx.fill();
  }
  ctx.fillStyle = el.reverse ? '#fff' : '#000';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${el.letterSpacing}px`;

  // Shrink the font until the text fits the box.
  let size = el.size;
  for (; size > 6; size--) {
    ctx.font = font(size);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= boxW && size * (1 + el.lineSpacing * (lines.length - 1)) <= boxH) break;
  }
  ctx.font = font(size);

  const lineH = size * el.lineSpacing;
  const cy = el.y + el.h / 2;
  lines.forEach((line, i) => {
    const y = cy + (i - (lines.length - 1) / 2) * lineH;
    const width = ctx.measureText(line).width;
    let x = el.x + pad;
    if (el.align === 'center') x += (boxW - width) / 2;
    else if (el.align === 'right') x += boxW - width;
    ctx.fillText(line, x, y);
    if (el.underline) ctx.fillRect(x, y + size * 0.45, width, Math.max(2, size / 14));
  });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function drawBorder(ctx, el) {
  const s = el.stroke;
  ctx.lineWidth = s;
  ctx.strokeStyle = '#000';
  const inset = (n) => [el.x + n + s / 2, el.y + n + s / 2, el.w - 2 * n - s, el.h - 2 * n - s];
  ctx.setLineDash(el.style === 'dashed' ? [s * 3, s * 2] : el.style === 'dotted' ? [s, s * 1.5] : []);
  ctx.lineCap = el.style === 'dotted' ? 'round' : 'butt';
  ctx.beginPath();
  if (el.style === 'rounded' || el.style === 'dashed' || el.style === 'dotted') ctx.roundRect(...inset(0), 12);
  else ctx.rect(...inset(0));
  if (el.style === 'double') ctx.rect(...inset(s * 2));
  if (el.style === 'ticket') {
    // Rectangle with scooped corners.
    const [x, y, w, h] = inset(0);
    const r = Math.min(10, h / 4);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w, y, r, Math.PI, Math.PI / 2, true);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + w, y + h, r, -Math.PI / 2, Math.PI, true);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x, y + h, r, 0, -Math.PI / 2, true);
    ctx.lineTo(x, y + r);
    ctx.arc(x, y, r, Math.PI / 2, 0, true);
  }
  ctx.stroke();
  ctx.setLineDash([]);
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
    case 'border': drawBorder(ctx, el); break;
    case 'shape': drawShape(ctx, el); break;
    case 'line': drawLine(ctx, el); break;
    case 'barcode': drawBarcode(ctx, el); break;
    case 'qr': drawQR(ctx, el); break;
    case 'image': drawImage(ctx, el); break;
    case 'icon': drawIcon(ctx, el.icon, el.x, el.y, el.w, el.h); break;
  }
  ctx.restore();
}

// Draw the whole label. offset shifts everything (print calibration), in dots.
export function draw(canvas, doc, { offset = { x: 0, y: 0 } } = {}) {
  const { w, h } = labelDots(doc);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(offset.x, offset.y);
  for (const el of doc.elements) drawElement(ctx, el);
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
