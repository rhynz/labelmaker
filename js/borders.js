// Border designs. Each one is drawn with canvas paths (no image files), so it prints
// crisply at any label size and works offline. draw(ctx, r, s) fills the element box
// r = {x, y, w, h} in black; s is the element's Thickness setting (1-12), which also
// sets the size of motifs like hearts or flowers.

const TAU = Math.PI * 2;

// ---- sizes ----
const unitSize = (s) => 4 + 3 * s; // motif size in dots (13 at the default thickness)
const lineWidth = (s) => Math.max(1.5, s * 0.6);
// Splits a length into whole repeats of about p, so a pattern ends exactly at each corner.
const repeat = (len, p) => len / Math.max(1, Math.round(len / p));

// Random numbers that are the same every time for the same label size (confetti, hand drawn).
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedFor = (r, n) => (Math.round(r.w) * 7919 + Math.round(r.h) * 104729 + n) | 0;

// ---- layout helpers ----
function outline(c, r, inset, width, radius = 0) {
  const d = inset + width / 2;
  c.lineWidth = width;
  c.beginPath();
  c.roundRect(r.x + d, r.y + d, Math.max(0, r.w - 2 * d), Math.max(0, r.h - 2 * d), radius);
  c.stroke();
}

function poly(c, pts) {
  c.beginPath();
  for (const [x, y] of pts) c.lineTo(x, y);
  c.closePath();
}

// Runs fn once per side of the box inset by d, clockwise from the top. In each call x runs
// along the side from corner to corner (0..len) and +y points into the label.
function sides(c, r, d, fn) {
  const x = r.x + d, y = r.y + d, w = r.w - 2 * d, h = r.h - 2 * d;
  [[x, y, 0, w], [x + w, y, Math.PI / 2, h], [x + w, y + h, Math.PI, w], [x, y + h, -Math.PI / 2, h]].forEach(([x0, y0, a, len], i) => {
    if (len <= 0) return;
    c.save();
    c.translate(x0, y0);
    c.rotate(a);
    fn(len, i);
    c.restore();
  });
}

// Runs fn at each corner of the box inset by d; the label lies towards +x and +y.
function corners(c, r, d, fn) {
  const x = r.x + d, y = r.y + d, w = r.w - 2 * d, h = r.h - 2 * d;
  [[x, y, 0], [x + w, y, Math.PI / 2], [x + w, y + h, Math.PI], [x, y + h, -Math.PI / 2]].forEach(([x0, y0, a], i) => {
    c.save();
    c.translate(x0, y0);
    c.rotate(a);
    fn(i);
    c.restore();
  });
}

// Fill or draw inside the ring between the box and the box inset by d.
function band(c, r, d, fn) {
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.rect(r.x + d, r.y + d, Math.max(0, r.w - 2 * d), Math.max(0, r.h - 2 * d));
  c.clip('evenodd');
  fn();
  c.restore();
}

// Repeats motifs evenly round the box, one on every corner. With several motifs they take
// turns (an even count per side keeps the first one on the corners). Motifs stay upright
// unless upright is false, then they turn to follow the side ("up" points outwards).
function motifs(c, r, s, list, { scale = 1, gap = 1.5, upright = true, line = false } = {}) {
  const m = unitSize(s) * scale;
  const d = m / 2 + 1;
  const x = r.x + d, y = r.y + d, w = Math.max(0, r.w - 2 * d), h = Math.max(0, r.h - 2 * d);
  const count = (len) => {
    const n = Math.max(1, Math.round(len / (m * gap)));
    return list.length > 1 ? Math.max(2, n + (n % 2)) : n;
  };
  const nx = count(w), ny = count(h);
  const pts = [];
  for (let i = 0; i <= nx; i++) pts.push([x + (w * i) / nx, y, 0, i], [x + (w * i) / nx, y + h, Math.PI, i]);
  for (let j = 1; j < ny; j++) pts.push([x + w, y + (h * j) / ny, Math.PI / 2, j], [x, y + (h * j) / ny, -Math.PI / 2, j]);
  if (line) outline(c, r, m + 2, Math.max(1, s * 0.4));
  for (const [px, py, a, k] of pts) {
    c.save();
    c.translate(px, py);
    if (!upright) c.rotate(a);
    list[k % list.length](c, m);
    c.restore();
  }
}

// ---- motifs: drawn around (0, 0), m dots across, pointing up ----
const smaller = (f, k) => (c, m) => f(c, m * k);

const dot = (c, m) => { c.beginPath(); c.arc(0, 0, m / 2, 0, TAU); c.fill(); };
const ring = (c, m) => { c.lineWidth = Math.max(1, m / 8); c.beginPath(); c.arc(0, 0, m / 2 - c.lineWidth / 2, 0, TAU); c.stroke(); };
const dash = (c, m) => c.fillRect(-m / 2, -m * 0.13, m, m * 0.26);
const diamond = (c, m) => { poly(c, [[0, -m / 2], [m * 0.36, 0], [0, m / 2], [-m * 0.36, 0]]); c.fill(); };

function heart(c, m) {
  const k = m / 2;
  c.beginPath();
  c.moveTo(0, k * 0.85);
  c.bezierCurveTo(-k * 1.55, -k * 0.15, -k * 0.6, -k * 1.25, 0, -k * 0.4);
  c.bezierCurveTo(k * 0.6, -k * 1.25, k * 1.55, -k * 0.15, 0, k * 0.85);
  c.fill();
}

function star(c, m, points = 5, inner = 0.45) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = ((i % 2 ? inner : 1) * m) / 2, a = -Math.PI / 2 + (i * Math.PI) / points;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

function sparkle(c, m) {
  const k = m / 2, q = k * 0.14;
  c.beginPath();
  c.moveTo(0, -k);
  c.quadraticCurveTo(q, -q, k, 0);
  c.quadraticCurveTo(q, q, 0, k);
  c.quadraticCurveTo(-q, q, -k, 0);
  c.quadraticCurveTo(-q, -q, 0, -k);
  c.fill();
}

function flower(c, m) {
  const k = m / 2;
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 5, px = Math.cos(a) * k * 0.52, py = Math.sin(a) * k * 0.52;
    c.moveTo(px + k * 0.48, py);
    c.arc(px, py, k * 0.48, 0, TAU);
  }
  c.fill();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(0, 0, k * 0.3, 0, TAU);
  c.fill();
  c.fillStyle = '#000';
  c.beginPath();
  c.arc(0, 0, k * 0.16, 0, TAU);
  c.fill();
}

function daisy(c, m) {
  const k = m / 2;
  for (let i = 0; i < 8; i++) {
    c.save();
    c.rotate((i * TAU) / 8);
    c.beginPath();
    c.ellipse(0, -k * 0.58, k * 0.17, k * 0.42, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  c.beginPath();
  c.arc(0, 0, k * 0.26, 0, TAU);
  c.fill();
}

function tulip(c, m) {
  const k = m / 2;
  c.beginPath();
  c.moveTo(-k * 0.55, -k * 0.75);
  c.lineTo(-k * 0.22, -k * 0.42);
  c.lineTo(0, -k * 0.85);
  c.lineTo(k * 0.22, -k * 0.42);
  c.lineTo(k * 0.55, -k * 0.75);
  c.quadraticCurveTo(k * 0.62, k * 0.15, 0, k * 0.15);
  c.quadraticCurveTo(-k * 0.62, k * 0.15, -k * 0.55, -k * 0.75);
  c.fill();
  c.fillRect(-k * 0.07, k * 0.1, k * 0.14, k * 0.9);
}

// A leaf m long, pointing up.
function leaf(c, m) {
  const k = m / 2;
  c.beginPath();
  c.moveTo(0, k);
  c.quadraticCurveTo(k * 0.9, 0, 0, -k);
  c.quadraticCurveTo(-k * 0.9, 0, 0, k);
  c.fill();
}
const leafAlong = (c, m) => { c.rotate(Math.PI / 2); leaf(c, m * 1.1); };

function snowflake(c, m) {
  const k = m / 2;
  c.lineWidth = Math.max(1, m / 9);
  c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    c.save();
    c.rotate((i * TAU) / 6);
    c.moveTo(0, 0); c.lineTo(0, -k * 0.95);
    c.moveTo(0, -k * 0.5); c.lineTo(k * 0.26, -k * 0.78);
    c.moveTo(0, -k * 0.5); c.lineTo(-k * 0.26, -k * 0.78);
    c.restore();
  }
  c.stroke();
}

function hollyLeaf(c, m) {
  const k = m / 2;
  const right = [[0, -1], [0.2, -0.72], [0.45, -0.68], [0.32, -0.32], [0.52, -0.08], [0.34, 0.2], [0.44, 0.52], [0.18, 0.58], [0, 1]]
    .map(([x, y]) => [x * k, y * k]);
  poly(c, [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y])]);
  c.fill();
}

function holly(c, m) {
  for (const sgn of [-1, 1]) {
    c.save();
    c.rotate(sgn * 1.05);
    c.translate(0, -m * 0.3);
    hollyLeaf(c, m * 0.62);
    c.restore();
  }
  c.strokeStyle = '#fff';
  c.lineWidth = Math.max(1, m / 16);
  for (const [x, y] of [[0, -m * 0.02], [-m * 0.13, m * 0.12], [m * 0.13, m * 0.12]]) {
    c.beginPath();
    c.arc(x, y, m * 0.12, 0, TAU);
    c.fill();
    c.stroke();
  }
}

function tree(c, m) {
  const k = m / 2;
  c.beginPath();
  c.moveTo(0, -k); c.lineTo(k * 0.5, -k * 0.2); c.lineTo(-k * 0.5, -k * 0.2); c.closePath();
  c.moveTo(0, -k * 0.55); c.lineTo(k * 0.75, k * 0.55); c.lineTo(-k * 0.75, k * 0.55); c.closePath();
  c.fill();
  c.fillRect(-k * 0.12, k * 0.5, k * 0.24, k * 0.45);
}

function pumpkin(c, m) {
  const k = m / 2;
  c.beginPath();
  for (const cx of [-0.38, 0.38, 0]) {
    c.moveTo(cx * k + k * 0.42, k * 0.12);
    c.ellipse(cx * k, k * 0.12, k * 0.42, k * 0.72, 0, 0, TAU);
  }
  c.fill();
  c.strokeStyle = '#fff';
  c.lineWidth = Math.max(1, m / 16);
  c.beginPath();
  c.ellipse(0, k * 0.12, k * 0.38, k * 0.66, 0, 0, TAU);
  c.stroke();
  c.fillRect(-k * 0.09, -k * 0.95, k * 0.18, k * 0.4);
}

function egg(c, m) {
  const k = m / 2;
  c.save();
  c.beginPath();
  c.moveTo(0, -k);
  c.bezierCurveTo(k * 0.7, -k, k * 0.72, k, 0, k);
  c.bezierCurveTo(-k * 0.72, k, -k * 0.7, -k, 0, -k);
  c.fill();
  c.clip();
  c.strokeStyle = '#fff';
  c.lineWidth = Math.max(1, m / 12);
  c.beginPath();
  for (let i = 0; i <= 6; i++) c.lineTo(-k + (i * k) / 3, k * 0.1 + (i % 2 ? -k * 0.16 : k * 0.16));
  c.stroke();
  c.restore();
}

function shamrock(c, m) {
  for (let i = 0; i < 3; i++) {
    c.save();
    c.rotate((i * TAU) / 3);
    c.translate(0, -m * 0.24);
    heart(c, m * 0.52);
    c.restore();
  }
  c.lineWidth = Math.max(1, m / 10);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(m * 0.05, m * 0.3, m * 0.2, m * 0.48);
  c.stroke();
}

function paw(c, m) {
  const k = m / 2;
  c.beginPath();
  c.ellipse(0, k * 0.3, k * 0.44, k * 0.38, 0, 0, TAU);
  for (const [x, y, a] of [[-0.66, -0.12, 0.4], [-0.25, -0.62, 0.15], [0.25, -0.62, -0.15], [0.66, -0.12, -0.4]]) {
    c.moveTo(x * k + k * 0.2, y * k);
    c.ellipse(x * k, y * k, k * 0.2, k * 0.27, a, 0, TAU);
  }
  c.fill();
}

function bone(c, m) {
  const k = m / 2;
  c.fillRect(-k * 0.62, -k * 0.15, k * 1.24, k * 0.3);
  c.beginPath();
  for (const [x, y] of [[-0.62, -0.2], [-0.62, 0.2], [0.62, -0.2], [0.62, 0.2]]) {
    c.moveTo(x * k + k * 0.22, y * k);
    c.arc(x * k, y * k, k * 0.22, 0, TAU);
  }
  c.fill();
}

function moon(c, m) {
  const k = m / 2;
  c.save();
  c.beginPath();
  c.arc(0, 0, k * 0.9, 0, TAU);
  c.fill();
  c.clip();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(k * 0.45, -k * 0.25, k * 0.75, 0, TAU);
  c.fill();
  c.restore();
}

function note(c, m) {
  const k = m / 2;
  c.beginPath();
  c.ellipse(-k * 0.22, k * 0.58, k * 0.36, k * 0.26, -0.35, 0, TAU);
  c.fill();
  c.fillRect(k * 0.04, -k * 0.9, k * 0.13, k * 1.45);
  c.lineWidth = k * 0.16;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(k * 0.12, -k * 0.86);
  c.quadraticCurveTo(k * 0.7, -k * 0.6, k * 0.55, -k * 0.1);
  c.stroke();
}

function balloon(c, m) {
  const k = m / 2;
  c.beginPath();
  c.ellipse(0, -k * 0.25, k * 0.55, k * 0.68, 0, 0, TAU);
  c.fill();
  poly(c, [[0, k * 0.4], [k * 0.12, k * 0.55], [-k * 0.12, k * 0.55]]);
  c.fill();
  c.lineWidth = Math.max(1, m / 18);
  c.beginPath();
  c.moveTo(0, k * 0.55);
  c.quadraticCurveTo(k * 0.25, k * 0.75, 0, k);
  c.stroke();
}

function gift(c, m) {
  const k = m / 2;
  c.fillRect(-k * 0.7, -k * 0.3, k * 1.4, k * 1.1);
  c.fillStyle = '#fff';
  c.fillRect(-k * 0.09, -k * 0.3, k * 0.18, k * 1.1);
  c.fillRect(-k * 0.7, -k * 0.02, k * 1.4, k * 0.12);
  c.fillStyle = '#000';
  c.lineWidth = Math.max(1, m / 12);
  c.beginPath();
  c.ellipse(-k * 0.25, -k * 0.55, k * 0.24, k * 0.16, 0.5, 0, TAU);
  c.moveTo(k * 0.49, -k * 0.55);
  c.ellipse(k * 0.25, -k * 0.55, k * 0.24, k * 0.16, -0.5, 0, TAU);
  c.stroke();
}

// A Christmas light hanging down from (0, 0).
function bulb(c, m, hollow) {
  c.fillRect(-m * 0.12, 0, m * 0.24, m * 0.22);
  c.beginPath();
  c.ellipse(0, m * 0.58, m * 0.24, m * 0.37, 0, 0, TAU);
  if (hollow) { c.lineWidth = Math.max(1, m / 10); c.stroke(); } else c.fill();
}

// ---- designs that run along each side ----
function wave(c, r, s, { amp = 0.3, period = 5, width = 1, twist = false } = {}) {
  const a = unitSize(s) * amp, lw = lineWidth(s) * width;
  c.lineWidth = lw;
  c.lineJoin = c.lineCap = 'round';
  sides(c, r, a + lw / 2, (len) => {
    const p = repeat(len, a * period);
    for (const sign of twist ? [1, -1] : [1]) {
      c.beginPath();
      for (let t = 0; t <= len; t++) c.lineTo(t, -sign * a * Math.sin((TAU * t) / p));
      c.stroke();
    }
  });
}

function zigzag(c, r, s, { width = 1, round = false } = {}) {
  const a = unitSize(s) * 0.28, lw = lineWidth(s) * width;
  c.lineWidth = lw;
  c.lineJoin = round ? 'round' : 'miter';
  c.lineCap = 'round';
  sides(c, r, a + lw, (len) => {
    const p = repeat(len, a * 2.4);
    c.beginPath();
    c.moveTo(0, 0);
    for (let x = 0; x < len - 0.01; x += p) { c.lineTo(x + p / 4, -a); c.lineTo(x + (3 * p) / 4, a); c.lineTo(x + p, 0); }
    c.stroke();
  });
}

function scallop(c, r, s, { lace = false } = {}) {
  const a = unitSize(s) * 0.32, lw = Math.max(1, s * 0.5);
  c.lineWidth = lw;
  sides(c, r, a + lw / 2, (len) => {
    const p = repeat(len, a * 2);
    c.beginPath();
    c.moveTo(0, 0);
    for (let x = 0; x < len - 0.01; x += p) c.ellipse(x + p / 2, 0, p / 2, a, 0, Math.PI, 0);
    c.stroke();
    if (lace) for (let x = 0; x < len - 0.01; x += p) { c.beginPath(); c.arc(x + p / 2, -a * 0.38, Math.max(1, a * 0.2), 0, TAU); c.fill(); }
  });
  if (lace) outline(c, r, a * 1.6 + lw, lw);
}

function rope(c, r, s) {
  const a = unitSize(s) * 0.3, lw = Math.max(1, s * 0.45);
  c.lineWidth = lw;
  c.lineCap = 'round';
  sides(c, r, a + lw / 2, (len) => {
    const p = repeat(len, a * 1.4);
    c.beginPath();
    c.moveTo(-a, -a); c.lineTo(len + a, -a);
    c.moveTo(a, a); c.lineTo(len - a, a);
    for (let x = 0; x < len - p * 0.5; x += p) {
      c.moveTo(x, a);
      c.bezierCurveTo(x + p * 0.1, -a * 0.2, x + p * 0.6, -a * 0.7, x + p * 1.15, -a);
    }
    c.stroke();
  });
}

function chain(c, r, s) {
  const a = unitSize(s) * 0.3, lw = Math.max(1, s * 0.45);
  c.lineWidth = lw;
  sides(c, r, a + lw / 2, (len) => {
    const p = repeat(len, a * 1.5);
    let k = 0;
    for (let x = 0; x < len - 0.01; x += p, k++) {
      const ry = k % 2 ? a * 0.32 : a;
      c.beginPath();
      c.ellipse(x + p / 2, 0, p * 0.62, ry, 0, 0, TAU);
      c.stroke();
    }
  });
}

function greekKey(c, r, s) {
  const D = unitSize(s) * 0.9, lw = Math.max(1, s * 0.45);
  c.lineWidth = lw;
  c.lineCap = 'square';
  sides(c, r, lw / 2, (len) => {
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(len, 0);
    c.moveTo(D, D); c.lineTo(len - D, D);
    c.rect(D * 0.3, D * 0.3, D * 0.4, D * 0.4);
    const inner = len - 2 * D;
    if (inner > D) {
      const U = repeat(inner, D * 1.25), g = U / 5, q = D / 4;
      for (let x = D; x < len - D - 0.01; x += U) {
        c.moveTo(x + g * 0.5, D);
        for (const [gx, gy] of [[0.5, 1], [3.5, 1], [3.5, 3], [2, 3], [2, 2]]) c.lineTo(x + gx * g, gy * q);
      }
    }
    c.stroke();
  });
}

function stripes(c, r, s, { depth = 0.7, pitch = 0.9 } = {}) {
  const d = unitSize(s) * depth, p = d * pitch, lw = Math.max(1, s * 0.4);
  band(c, r, d, () => {
    c.lineWidth = p / 2;
    c.beginPath();
    for (let t = -r.h; t < r.w + r.h; t += p) { c.moveTo(r.x + t, r.y - 2); c.lineTo(r.x + t + r.h + 4, r.y + r.h + 2); }
    c.stroke();
  });
  outline(c, r, 0, lw);
  outline(c, r, d - lw, lw);
}

function checkers(c, r, s) {
  const q = unitSize(s) * 0.42;
  const nx = Math.max(4, Math.round(r.w / q)), ny = Math.max(4, Math.round(r.h / q));
  const qx = r.w / nx, qy = r.h / ny;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (j >= 2 && j < ny - 2 && i >= 2 && i < nx - 2) continue;
      if ((i + j) % 2 === 0) c.fillRect(r.x + i * qx, r.y + j * qy, qx + 0.3, qy + 0.3);
    }
  }
  c.lineWidth = Math.max(1, s * 0.3);
  c.strokeRect(r.x + 2 * qx, r.y + 2 * qy, r.w - 4 * qx, r.h - 4 * qy);
}

function filmStrip(c, r, s) {
  const d = unitSize(s) * 0.8, hw = d * 0.55, hh = d * 0.45;
  band(c, r, d, () => c.fillRect(r.x, r.y, r.w, r.h));
  c.fillStyle = '#fff';
  sides(c, r, 0, (len) => {
    if (len - 2 * d < hw) return;
    const p = repeat(len - 2 * d, d * 1.2);
    for (let x = d; x < len - d - 0.01; x += p) { c.beginPath(); c.roundRect(x + (p - hw) / 2, (d - hh) / 2, hw, hh, hh * 0.25); c.fill(); }
  });
}

function stamp(c, r, s) {
  const lw = Math.max(1, s * 0.5), rr = Math.max(2, s * 0.9 + 1);
  c.lineWidth = lw;
  sides(c, r, lw / 2, (len) => {
    const p = repeat(len, rr * 3.2);
    c.beginPath();
    c.moveTo(0, 0);
    for (let x = 0; x < len - 0.01; x += p) { c.lineTo(x + p / 2 - rr, 0); c.arc(x + p / 2, 0, rr, Math.PI, 0, true); }
    c.lineTo(len, 0);
    c.stroke();
  });
  outline(c, r, rr + s * 1.2, Math.max(1, s * 0.6));
}

function lights(c, r, s) {
  const m = unitSize(s) * 1.1, a = m * 0.1, lw = Math.max(1, s * 0.35);
  sides(c, r, a + lw + 1, (len) => {
    const n = Math.max(1, Math.round(len / (m * 1.2))), p = len / n;
    c.lineWidth = lw;
    c.beginPath();
    for (let t = 0; t <= len; t++) c.lineTo(t, -a * Math.cos((TAU * t) / p));
    c.stroke();
    for (let k = 0; k < n; k++) {
      c.save();
      c.translate(k * p + p / 2, a);
      c.rotate(k % 2 ? 0.3 : -0.3);
      bulb(c, m * 0.7, k % 3 === 1);
      c.restore();
    }
  });
}

function bunting(c, r, s) {
  const m = unitSize(s), lw = Math.max(1, s * 0.35);
  sides(c, r, lw / 2 + 1, (len) => {
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(len, 0);
    c.stroke();
    const free = len - 2 * m;
    if (free < m * 0.8) return;
    const n = Math.max(1, Math.round(free / (m * 1.15))), p = free / n;
    for (let k = 0; k < n; k++) {
      const x = m + k * p + p / 2, hw = p * 0.4;
      poly(c, [[x - hw, 0], [x + hw, 0], [x, m * 0.95]]);
      if (k % 2) c.stroke(); else c.fill();
    }
  });
}

function confetti(c, r, s) {
  const m = unitSize(s), d = m * 1.1, rnd = rng(seedFor(r, 7));
  sides(c, r, m * 0.35, (len) => {
    const n = Math.round(len / (m * 0.55));
    for (let k = 0; k < n; k++) {
      const x = rnd() * len, y = rnd() * d * 0.8, z = m * (0.2 + rnd() * 0.22), kind = Math.floor(rnd() * 4);
      c.save();
      c.translate(x, y);
      c.rotate(rnd() * TAU);
      c.beginPath();
      if (kind === 0) { c.arc(0, 0, z * 0.6, 0, TAU); c.fill(); }
      else if (kind === 1) { c.rect(-z * 0.7, -z * 0.28, z * 1.4, z * 0.56); c.fill(); }
      else if (kind === 2) { poly(c, [[0, -z * 0.7], [z * 0.6, z * 0.5], [-z * 0.6, z * 0.5]]); c.fill(); }
      else {
        c.lineWidth = Math.max(1, z * 0.3);
        c.lineCap = 'round';
        c.moveTo(-z, 0);
        c.quadraticCurveTo(-z * 0.5, -z * 0.7, 0, 0);
        c.quadraticCurveTo(z * 0.5, z * 0.7, z, 0);
        c.stroke();
      }
      c.restore();
    }
  });
}

function laurel(c, r, s) {
  const L = unitSize(s) * 0.7, lw = Math.max(1, s * 0.35);
  c.lineWidth = lw;
  sides(c, r, L * 0.62 + 1, (len) => {
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(len, 0);
    c.stroke();
    const p = repeat(len, L * 0.95);
    for (let x = p / 2; x < len; x += p) {
      for (const tilt of [-0.75, 0.75]) {
        c.save();
        c.translate(x, 0);
        c.rotate(Math.PI / 2 + tilt);
        c.translate(0, -L / 2);
        leaf(c, L);
        c.restore();
      }
    }
  });
}

function vine(c, r, s) {
  const m = unitSize(s), a = m * 0.2, L = m * 0.65, lw = Math.max(1, s * 0.35);
  c.lineWidth = lw;
  c.lineCap = 'round';
  sides(c, r, a + L * 0.8, (len) => {
    const p = repeat(len, m * 1.6);
    c.beginPath();
    for (let t = 0; t <= len; t++) c.lineTo(t, -a * Math.sin((TAU * t) / p));
    c.stroke();
    for (let x = 0; x < len - 0.01; x += p) {
      for (const [dx, y, tilt] of [[0.25, -a, -1], [0.75, a, 1]]) {
        c.save();
        c.translate(x + p * dx, y);
        c.rotate(Math.PI / 2 + tilt);
        c.translate(0, -L / 2);
        leaf(c, L);
        c.restore();
      }
    }
  });
}

// ---- frames ----
function ticket(c, r, s) {
  const d = s / 2, x = r.x + d, y = r.y + d, w = r.w - s, h = r.h - s;
  const rr = Math.min(10, h / 4);
  c.lineWidth = s;
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.arc(x + w, y, rr, Math.PI, Math.PI / 2, true);
  c.lineTo(x + w, y + h - rr);
  c.arc(x + w, y + h, rr, -Math.PI / 2, Math.PI, true);
  c.lineTo(x + rr, y + h);
  c.arc(x, y + h, rr, 0, -Math.PI / 2, true);
  c.lineTo(x, y + rr);
  c.arc(x, y, rr, Math.PI / 2, 0, true);
  c.stroke();
}

function badge(c, r, s) {
  const d = s / 2, x = r.x + d, y = r.y + d, w = r.w - s, h = r.h - s, k = Math.min(w, h) * 0.22;
  c.lineWidth = s;
  poly(c, [[x + k, y], [x + w - k, y], [x + w, y + k], [x + w, y + h - k], [x + w - k, y + h], [x + k, y + h], [x, y + h - k], [x, y + k]]);
  c.stroke();
}

function deco(c, r, s) {
  const notched = (x, y, w, h, k) => poly(c, [
    [x + k, y], [x + w - k, y], [x + w - k, y + k], [x + w, y + k], [x + w, y + h - k], [x + w - k, y + h - k],
    [x + w - k, y + h], [x + k, y + h], [x + k, y + h - k], [x, y + h - k], [x, y + k], [x + k, y + k],
  ]);
  const lw = Math.max(1, s * 0.6), k = Math.min(r.w, r.h) * 0.16, t = lw * 3;
  c.lineWidth = lw;
  notched(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw, k);
  c.stroke();
  notched(r.x + lw / 2 + t, r.y + lw / 2 + t, r.w - lw - 2 * t, r.h - lw - 2 * t, k);
  c.stroke();
}

function brackets(c, r, s, { frame = false } = {}) {
  const L = Math.min(r.w, r.h) * 0.35;
  if (frame) outline(c, r, s * 1.5, Math.max(1, s * 0.3));
  c.lineWidth = s;
  c.lineCap = 'square';
  corners(c, r, s / 2, () => {
    c.beginPath();
    c.moveTo(0, L);
    c.lineTo(0, 0);
    c.lineTo(L, 0);
    c.stroke();
  });
}

function shadow(c, r, s) {
  const o = Math.max(3, s * 1.5);
  c.lineWidth = s;
  c.strokeRect(r.x + s / 2, r.y + s / 2, r.w - o - s, r.h - o - s);
  c.fillRect(r.x + o, r.y + r.h - o, r.w - o, o);
  c.fillRect(r.x + r.w - o, r.y + o, o, r.h - o);
}

function arch(c, r, s) {
  const lw = Math.max(1.5, s * 0.7);
  const shape = (inset) => {
    const d = inset + lw / 2, w = r.w - 2 * d, h = r.h - 2 * d, R = Math.max(0, Math.min(w / 2, h * 0.6));
    c.lineWidth = lw;
    c.beginPath();
    c.roundRect(r.x + d, r.y + d, Math.max(0, w), Math.max(0, h), [R, R, 3, 3]);
    c.stroke();
  };
  shape(0);
  shape(lw * 2.5);
}

function handDrawn(c, r, s) {
  const rnd = rng(seedFor(r, 3)), amp = s * 0.45 + 0.8;
  c.lineWidth = Math.max(1.2, s * 0.6);
  c.lineCap = c.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    const p1 = rnd() * TAU, p2 = rnd() * TAU;
    sides(c, r, amp * 1.5 + c.lineWidth, (len, i) => {
      const over = Math.min(6, len * 0.05);
      c.beginPath();
      for (let t = -over; t <= len + over; t += 3) c.lineTo(t, (Math.sin(t / 23 + p1 + i) + 0.4 * Math.sin(t / 9 + p2 + 2 * i)) * amp);
      c.stroke();
    });
  }
}

function floralCorners(c, r, s) {
  const m = unitSize(s) * 1.3;
  outline(c, r, m * 0.5 - 0.5, Math.max(1, s * 0.4));
  corners(c, r, m * 0.5, () => {
    for (const a of [0, Math.PI / 2]) {
      c.save();
      c.rotate(a);
      c.translate(m * 0.95, 0);
      c.rotate(Math.PI / 2);
      leaf(c, m * 0.75);
      c.restore();
    }
    flower(c, m);
  });
}

function spiderWeb(c, r, s) {
  outline(c, r, 0, Math.max(1, s * 0.6));
  const L = Math.min(r.w, r.h) * 0.45;
  c.lineWidth = Math.max(1, s * 0.3);
  corners(c, r, 0, () => {
    const spokes = [0, 0.25, 0.5, 0.75, 1].map((f) => (f * Math.PI) / 2);
    c.beginPath();
    for (const a of spokes) { c.moveTo(0, 0); c.lineTo(Math.cos(a) * L, Math.sin(a) * L); }
    for (let j = 1; j <= 3; j++) {
      const R = (L * j) / 3.3;
      spokes.forEach((a, i) => {
        const px = Math.cos(a) * R, py = Math.sin(a) * R;
        if (i === 0) return c.moveTo(px, py);
        const b = (a + spokes[i - 1]) / 2;
        c.quadraticCurveTo(Math.cos(b) * R * 0.8, Math.sin(b) * R * 0.8, px, py);
      });
    }
    c.stroke();
  });
}

const design = (id, name, cat, draw) => ({ id, name, cat, draw });

export const BORDERS = [
  // Simple
  design('single', 'Square', 'Simple', (c, r, s) => outline(c, r, 0, s)),
  design('rounded', 'Rounded', 'Simple', (c, r, s) => outline(c, r, 0, s, 12)),
  design('pill', 'Pill', 'Simple', (c, r, s) => outline(c, r, 0, s, Math.min(r.w, r.h) / 2)),
  design('double', 'Double', 'Simple', (c, r, s) => { outline(c, r, 0, s); outline(c, r, s * 2, s); }),
  design('double-rounded', 'Double rounded', 'Simple', (c, r, s) => { outline(c, r, 0, s, 14); outline(c, r, s * 2, s, 10); }),
  design('thick-thin', 'Thick & thin', 'Simple', (c, r, s) => { outline(c, r, 0, s * 1.8); outline(c, r, s * 3, Math.max(1, s * 0.5)); }),
  design('triple', 'Triple', 'Simple', (c, r, s) => { const t = Math.max(1, s * 0.6); for (let i = 0; i < 3; i++) outline(c, r, i * t * 2.5, t); }),
  design('dashed', 'Dashed', 'Simple', (c, r, s) => { c.setLineDash([s * 3, s * 2]); outline(c, r, 0, s, 12); }),
  design('dotted', 'Dotted', 'Simple', (c, r, s) => { c.setLineDash([s, s * 1.5]); c.lineCap = 'round'; outline(c, r, 0, s, 12); }),
  design('stitched', 'Stitched', 'Simple', (c, r, s) => {
    outline(c, r, 0, Math.max(1, s * 0.5), 10);
    c.setLineDash([s * 2, s * 1.5]);
    outline(c, r, s * 2, Math.max(1, s * 0.6), 8);
  }),
  design('ticket', 'Ticket', 'Simple', ticket),
  design('badge', 'Badge', 'Simple', badge),

  // Floral
  design('flowers', 'Flowers', 'Floral', (c, r, s) => motifs(c, r, s, [flower])),
  design('daisies', 'Daisies', 'Floral', (c, r, s) => motifs(c, r, s, [daisy], { gap: 1.4 })),
  design('blossoms', 'Blossoms & dots', 'Floral', (c, r, s) => motifs(c, r, s, [flower, smaller(dot, 0.3)], { gap: 1 })),
  design('tulips', 'Tulips', 'Floral', (c, r, s) => motifs(c, r, s, [tulip], { gap: 1.3 })),
  design('leaves', 'Leaves', 'Floral', (c, r, s) => motifs(c, r, s, [leafAlong, smaller(dot, 0.25)], { upright: false, gap: 0.75 })),
  design('laurel', 'Laurel', 'Floral', laurel),
  design('vine', 'Vine', 'Floral', vine),
  design('floral-corners', 'Floral corners', 'Floral', floralCorners),
  design('flowers-frame', 'Flower frame', 'Floral', (c, r, s) => motifs(c, r, s, [flower, smaller(leafAlong, 0.8)], { upright: false, gap: 1, scale: 0.9, line: true })),

  // Patterns
  design('wave', 'Wave', 'Patterns', (c, r, s) => wave(c, r, s)),
  design('twist', 'Twist', 'Patterns', (c, r, s) => wave(c, r, s, { twist: true, width: 0.7 })),
  design('zigzag', 'Zigzag', 'Patterns', (c, r, s) => zigzag(c, r, s)),
  design('rickrack', 'Rickrack', 'Patterns', (c, r, s) => zigzag(c, r, s, { width: 1.8, round: true })),
  design('scallop', 'Scallop', 'Patterns', (c, r, s) => scallop(c, r, s)),
  design('lace', 'Lace', 'Patterns', (c, r, s) => scallop(c, r, s, { lace: true })),
  design('rope', 'Rope', 'Patterns', rope),
  design('chain', 'Chain', 'Patterns', chain),
  design('greek-key', 'Greek key', 'Patterns', greekKey),
  design('stripes', 'Stripes', 'Patterns', (c, r, s) => stripes(c, r, s)),
  design('beads', 'Beads', 'Patterns', (c, r, s) => motifs(c, r, s, [smaller(dot, 0.55), smaller(dot, 0.25)], { gap: 0.6 })),
  design('dots', 'Dots', 'Patterns', (c, r, s) => motifs(c, r, s, [smaller(dot, 0.6)], { gap: 1.2 })),
  design('diamonds', 'Diamonds', 'Patterns', (c, r, s) => motifs(c, r, s, [diamond, smaller(dot, 0.3)], { gap: 0.8 })),
  design('stamp', 'Stamp', 'Patterns', stamp),
  design('film', 'Film strip', 'Patterns', filmStrip),

  // Festive
  design('hearts', 'Hearts', 'Festive', (c, r, s) => motifs(c, r, s, [heart])),
  design('hearts-dots', 'Hearts & dots', 'Festive', (c, r, s) => motifs(c, r, s, [heart, smaller(dot, 0.3)], { gap: 0.9 })),
  design('stars', 'Stars', 'Festive', (c, r, s) => motifs(c, r, s, [star])),
  design('stars-line', 'Stars & line', 'Festive', (c, r, s) => motifs(c, r, s, [star, smaller(star, 0.55)], { gap: 0.9, line: true })),
  design('snowflakes', 'Snowflakes', 'Festive', (c, r, s) => motifs(c, r, s, [snowflake, smaller(dot, 0.3)], { gap: 0.9 })),
  design('lights', 'Christmas lights', 'Festive', lights),
  design('holly', 'Holly', 'Festive', (c, r, s) => motifs(c, r, s, [holly], { scale: 1.2, gap: 1.3 })),
  design('candy-cane', 'Candy cane', 'Festive', (c, r, s) => stripes(c, r, s, { depth: 0.8, pitch: 1.3 })),
  design('trees', 'Christmas trees', 'Festive', (c, r, s) => motifs(c, r, s, [tree, smaller(star, 0.45)], { gap: 0.9 })),
  design('gifts', 'Gifts', 'Festive', (c, r, s) => motifs(c, r, s, [gift], { gap: 1.4 })),
  design('bunting', 'Bunting', 'Festive', bunting),
  design('confetti', 'Confetti', 'Festive', confetti),
  design('balloons', 'Balloons', 'Festive', (c, r, s) => motifs(c, r, s, [balloon], { gap: 1.2, scale: 1.1 })),
  design('pumpkins', 'Pumpkins', 'Festive', (c, r, s) => motifs(c, r, s, [pumpkin], { gap: 1.4 })),
  design('spider-web', 'Spider webs', 'Festive', spiderWeb),
  design('eggs', 'Easter eggs', 'Festive', (c, r, s) => motifs(c, r, s, [egg, smaller(dot, 0.3)], { gap: 0.9 })),
  design('shamrocks', 'Shamrocks', 'Festive', (c, r, s) => motifs(c, r, s, [shamrock], { gap: 1.4 })),
  design('music', 'Music notes', 'Festive', (c, r, s) => motifs(c, r, s, [note], { gap: 1.3 })),
  design('paws', 'Paws & bones', 'Festive', (c, r, s) => motifs(c, r, s, [paw, smaller(bone, 0.9)], { gap: 1 })),

  // Trendy
  design('hand-drawn', 'Hand drawn', 'Trendy', handDrawn),
  design('sparkles', 'Sparkles', 'Trendy', (c, r, s) => motifs(c, r, s, [sparkle, smaller(sparkle, 0.5)], { gap: 0.9 })),
  design('celestial', 'Moon & stars', 'Trendy', (c, r, s) => motifs(c, r, s, [moon, smaller(star, 0.6)], { gap: 0.9 })),
  design('bubbles', 'Bubbles', 'Trendy', (c, r, s) => motifs(c, r, s, [ring, smaller(ring, 0.55)], { gap: 0.85 })),
  design('boho', 'Boho dots', 'Trendy', (c, r, s) => motifs(c, r, s, [smaller(dot, 0.45), smaller(dash, 0.9)], { upright: false, gap: 0.75 })),
  design('arch', 'Arch', 'Trendy', arch),
  design('shadow', 'Retro shadow', 'Trendy', shadow),
  design('corners', 'Corners', 'Trendy', (c, r, s) => brackets(c, r, s)),
  design('corners-frame', 'Corners & frame', 'Trendy', (c, r, s) => brackets(c, r, s, { frame: true })),
  design('deco', 'Art deco', 'Trendy', deco),
  design('wavy', 'Wavy', 'Trendy', (c, r, s) => wave(c, r, s, { amp: 0.22, period: 7, width: 1.6 })),
  design('checkers', 'Checkers', 'Trendy', checkers),
];

const POPULAR = ['rounded', 'double', 'scallop', 'flowers', 'hearts', 'stars', 'laurel', 'hand-drawn', 'sparkles', 'lights', 'confetti', 'stitched', 'wave', 'floral-corners', 'ticket', 'checkers'];
export const BORDER_CATEGORIES = ['Popular', 'Simple', 'Floral', 'Patterns', 'Festive', 'Trendy'];

const byId = new Map(BORDERS.map((b) => [b.id, b]));
export const borderDesign = (id) => byId.get(id) ?? byId.get('single');
export const bordersIn = (cat) => (cat === 'Popular' ? POPULAR.map((id) => byId.get(id)) : BORDERS.filter((b) => b.cat === cat));

export function drawBorderDesign(ctx, el) {
  ctx.fillStyle = ctx.strokeStyle = '#000';
  borderDesign(el.style).draw(ctx, el, el.stroke);
}
