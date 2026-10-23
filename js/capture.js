// Filling fields without typing: text from a photo (OCR), dictation, and
// reading an existing barcode or QR code from a photo.

// ---- OCR (Tesseract.js, fetched on first use; ~10 MB with English data) ----
let tesseract;
function loadTesseract() {
  tesseract ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { tesseract = null; reject(new Error('Could not load the text scanner (are you offline?)')); };
    document.head.append(s);
  });
  return tesseract;
}

// Phone photos are huge; OCR is much faster on a smaller copy and just as accurate for labels.
async function shrink(file, maxSide = 1600) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

export async function recognizeText(file, onProgress) {
  const T = await loadTesseract();
  const image = await shrink(file);
  const worker = await T.createWorker('eng', 1, {
    logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress),
  });
  try {
    const { data } = await worker.recognize(image);
    // Drop blank lines and the stray punctuation OCR picks up from edges.
    return data.text.split('\n').map((l) => l.trim()).filter((l) => /[\p{L}\p{N}]/u.test(l)).join('\n');
  } finally {
    await worker.terminate();
  }
}

// ---- dictation (Web Speech API; Chrome on the Mac. On iPhone the keyboard's mic works anywhere) ----
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canDictate = !!Recognition;

// Listens for one phrase and resolves with the words ('' if nothing was heard).
export function dictate() {
  return new Promise((resolve, reject) => {
    const r = new Recognition();
    r.lang = navigator.language || 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    let heard = '';
    r.onresult = (e) => { heard = e.results[0][0].transcript; };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      reject(new Error(e.error === 'not-allowed' ? 'Microphone permission was denied' : `Dictation failed (${e.error})`));
    };
    r.onend = () => resolve(heard);
    r.start();
  });
}

// ---- barcode / QR reading (BarcodeDetector: Chrome on the Mac; not in iOS browsers) ----
export const canScanCodes = 'BarcodeDetector' in window;

// Detector format -> JsBarcode format used by the barcode element.
const FORMATS = { code_128: 'CODE128', code_39: 'CODE39', ean_13: 'EAN13', upc_a: 'UPC', itf: 'ITF14', qr_code: 'qr' };

export async function scanCode(file) {
  const bmp = await createImageBitmap(file);
  try {
    const [code] = await new window.BarcodeDetector().detect(bmp);
    if (!code) throw new Error('No barcode or QR code found in that photo');
    return { value: code.rawValue, format: FORMATS[code.format] ?? null };
  } finally {
    bmp.close();
  }
}

// Opens the photo picker (on iPhone this offers the camera too).
export function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files[0] ?? null);
    input.click();
  });
}
