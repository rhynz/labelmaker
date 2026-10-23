// Batch printing: fill {{Column}} placeholders in a label from rows of a
// CSV/TSV file (or an Excel sheet), one label per row.

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;
const FILLABLE = ['text', 'prefix', 'value']; // element fields that may hold placeholders

// Parse CSV/TSV text. The delimiter (comma, semicolon or tab) is guessed from the first line.
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.slice(0, text.indexOf('\n') >>> 0);
  const delim = ['\t', ';', ','].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ',');

  const records = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); records.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  return fromTable(records);
}

// First row is the header; blank rows are dropped.
function fromTable(table) {
  const nonEmpty = table.filter((r) => r.some((v) => String(v ?? '').trim() !== ''));
  if (!nonEmpty.length) return { columns: [], rows: [] };
  const columns = nonEmpty[0].map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
  const rows = nonEmpty.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c, String(r[i] ?? '').trim()])));
  return { columns, rows };
}

// SheetJS is large, so it is only fetched when someone opens an Excel file.
let sheetJS;
function loadSheetJS() {
  sheetJS ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { sheetJS = null; reject(new Error('Could not load the Excel reader (are you offline?). Save the sheet as CSV instead.')); };
    document.head.append(s);
  });
  return sheetJS;
}

export async function readDataFile(file) {
  if (/\.(xlsx|xlsm|xls|ods|numbers)$/i.test(file.name)) {
    const XLSX = await loadSheetJS();
    const book = XLSX.read(await file.arrayBuffer());
    const sheet = book.Sheets[book.SheetNames[0]];
    return fromTable(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }));
  }
  return parseCSV(await file.text());
}

// Placeholder names used anywhere in the label.
export function placeholders(doc) {
  const names = new Set();
  for (const el of doc.elements) {
    for (const k of FILLABLE) if (typeof el[k] === 'string') for (const m of el[k].matchAll(PLACEHOLDER)) names.add(m[1]);
  }
  return [...names];
}

// Column lookup ignores case and surrounding spaces.
function lookup(row, name) {
  const key = Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? `{{${name}}}` : row[key];
}

// A copy of the label with every placeholder replaced by the row's values.
export function fillDoc(doc, row) {
  const out = structuredClone(doc);
  for (const el of out.elements) {
    for (const k of FILLABLE) if (typeof el[k] === 'string') el[k] = el[k].replace(PLACEHOLDER, (_, name) => lookup(row, name));
  }
  return out;
}

export function missingColumns(doc, columns) {
  const have = new Set(columns.map((c) => c.toLowerCase()));
  return placeholders(doc).filter((p) => !have.has(p.toLowerCase()));
}
