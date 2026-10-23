// A small built-in icon set, drawn in a 24×24 box in solid black so it prints
// cleanly on a 1-bit thermal head.

const W = '#fff';

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
function strokeLines(ctx, width, segs) {
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const seg of segs) seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
function circle(ctx, x, y, r, fill = true) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  fill ? ctx.fill() : ctx.stroke();
}
function star(ctx, cx, cy, outer, inner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  poly(ctx, pts);
}

export const ICONS = {
  heart: (c) => c.fill(new Path2D('M12 21s-7.5-4.6-9.6-9.2C.9 8.2 3 4.5 6.6 4.5c2.2 0 3.7 1.3 4.4 2.6.7-1.3 2.2-2.6 4.4-2.6 3.6 0 5.7 3.7 4.2 7.3C19.5 16.4 12 21 12 21z')),
  star: (c) => star(c, 12, 12.8, 11, 4.6),
  sparkle: (c) => { star(c, 10, 13, 9, 2.2, 4); star(c, 19, 5, 4, 1, 4); },
  check: (c) => strokeLines(c, 3.5, [[[4, 12.5], [9.5, 18], [20, 6]]]),
  cross: (c) => strokeLines(c, 3.5, [[[5, 5], [19, 19]], [[19, 5], [5, 19]]]),
  warning: (c) => {
    c.lineJoin = 'round'; c.lineWidth = 2;
    poly(c, [[12, 2.5], [22.5, 20.5], [1.5, 20.5]]);
    c.fillStyle = W; c.fillRect(10.8, 8, 2.4, 7); circle(c, 12, 17.6, 1.4);
  },
  drop: (c) => c.fill(new Path2D('M12 2.5S5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-12.5-7-12.5z')),
  leaf: (c) => c.fill(new Path2D('M20 4C10 4 4 9 4 16c0 1.5.3 2.8.8 4C6 14 10 10 15 8c-4 3-7 7-8.5 12.5C8 21 9.5 21 11 21c6 0 9-6 9-17z')),
  snowflake: (c) => {
    const segs = [];
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      const dx = Math.cos(a), dy = Math.sin(a);
      segs.push([[12 - 10 * dx, 12 - 10 * dy], [12 + 10 * dx, 12 + 10 * dy]]);
      for (const s of [-1, 1]) {
        const bx = 12 + s * 6.5 * dx, by = 12 + s * 6.5 * dy;
        for (const t of [-1, 1]) {
          const b = a + t * 0.7 + (s < 0 ? Math.PI : 0);
          segs.push([[bx, by], [bx + 3.2 * Math.cos(b), by + 3.2 * Math.sin(b)]]);
        }
      }
    }
    strokeLines(c, 1.8, segs);
  },
  sun: (c) => {
    circle(c, 12, 12, 5);
    const segs = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      segs.push([[12 + 8 * Math.cos(a), 12 + 8 * Math.sin(a)], [12 + 10.5 * Math.cos(a), 12 + 10.5 * Math.sin(a)]]);
    }
    strokeLines(c, 2, segs);
  },
  moon: (c) => c.fill(new Path2D('M15 2.5a9.5 9.5 0 1 0 6.5 15.8A8 8 0 0 1 15 2.5z')),
  home: (c) => {
    poly(c, [[12, 2.5], [22, 11], [19, 11], [19, 21], [5, 21], [5, 11], [2, 11]]);
    c.fillStyle = W; c.fillRect(10, 14, 4, 7);
  },
  box: (c) => {
    c.fillRect(3, 6, 18, 15); c.fillRect(2, 3, 20, 4.5);
    c.fillStyle = W; c.fillRect(9, 10, 6, 2);
  },
  clock: (c) => {
    c.lineWidth = 2.5; circle(c, 12, 12, 9, false);
    strokeLines(c, 2.5, [[[12, 7], [12, 12], [15.5, 14]]]);
  },
  pin: (c) => {
    c.fill(new Path2D('M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z'));
    c.fillStyle = W; circle(c, 12, 9, 2.6);
  },
  mail: (c) => {
    c.fillRect(2, 5, 20, 14);
    c.strokeStyle = W; strokeLines(c, 1.8, [[[3, 6.5], [12, 13], [21, 6.5]]]);
  },
  pill: (c) => {
    c.translate(12, 12); c.rotate(-Math.PI / 4);
    c.lineWidth = 2;
    c.beginPath(); c.roundRect(-9.5, -4, 19, 8, 4); c.stroke();
    c.beginPath(); c.roundRect(-9.5, -4, 9.5, 8, [4, 0, 0, 4]); c.fill();
  },
  smile: (c) => {
    c.lineWidth = 2.2; circle(c, 12, 12, 9.5, false);
    circle(c, 8.8, 9.5, 1.5); circle(c, 15.2, 9.5, 1.5);
    c.beginPath(); c.arc(12, 12.5, 5, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  },
  paw: (c) => {
    c.beginPath(); c.ellipse(12, 16, 5.5, 4.5, 0, 0, Math.PI * 2); c.fill();
    [[5, 10.5], [9, 6], [15, 6], [19, 10.5]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 2.2, 2.8, 0, 0, Math.PI * 2); c.fill(); });
  },
  arrow: (c) => poly(c, [[3, 9.5], [13, 9.5], [13, 4], [21.5, 12], [13, 20], [13, 14.5], [3, 14.5]]),
  bolt: (c) => poly(c, [[13.5, 2], [4.5, 13.5], [11, 13.5], [9.5, 22], [19.5, 9.5], [13, 9.5]]),
};

export function drawIcon(ctx, name, x, y, w, h) {
  const draw = ICONS[name];
  if (!draw) return;
  const s = Math.min(w, h) / 24;
  ctx.save();
  ctx.translate(x + (w - 24 * s) / 2, y + (h - 24 * s) / 2);
  ctx.scale(s, s);
  ctx.fillStyle = ctx.strokeStyle = '#000';
  draw(ctx);
  ctx.restore();
}
