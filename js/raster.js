// Turns a label design into the D30's raster format.
//
// The D30 head is 96 dots (12 mm at 8 dots/mm) and the label feeds lengthwise,
// so a 12×40 mm label is a 320×96 design rotated into 96 dots × 320 rows.

export const DOTS_PER_MM = 8;
export const HEAD_DOTS = 96;

// Design canvas in label orientation: width = label length, height = tape width.
export function makeDesignCanvas(lengthMM) {
  const c = document.createElement('canvas');
  c.width = Math.round(lengthMM * DOTS_PER_MM);
  c.height = HEAD_DOTS;
  return c;
}

// Rotate the design 90° so each printed row runs across the tape.
export function toPrintCanvas(design, flip = false) {
  const c = document.createElement('canvas');
  c.width = design.height;
  c.height = design.width;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(((flip ? -90 : 90) * Math.PI) / 180);
  ctx.drawImage(design, -design.width / 2, -design.height / 2);
  return c;
}

// Pack to 1 bit per dot, MSB first, 1 = black (darker than threshold).
export function packBits(canvas, threshold = 128) {
  const { width, height } = canvas;
  const widthBytes = Math.ceil(width / 8);
  const px = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const bytes = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const alpha = px[i + 3] / 255;
      const dark = 255 - (255 - lum) * alpha < threshold; // transparent counts as white
      if (dark) bytes[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bytes, widthBytes, rows: height };
}
