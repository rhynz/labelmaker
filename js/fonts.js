// Loads Google Fonts on demand: one small stylesheet per family, added the first
// time a label or the font picker needs it. The service worker keeps fetched fonts for offline use.

import { FONTS } from './model.js';

const loading = new Map(); // family -> Promise that settles once its stylesheet has loaded

const fontFor = (css) => FONTS.find((f) => f.css === css) ?? FONTS.find((f) => f.web && css?.startsWith(`"${f.web.family}"`));

function fontURL({ family, weights }) {
  const name = family.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${name}${weights === '400' ? '' : `:wght@${weights}`}&display=swap`;
}

// Resolves when the font's @font-face rules exist (not necessarily its files; use document.fonts.load for that).
export function loadFont(css) {
  const web = fontFor(css)?.web;
  if (!web) return Promise.resolve();
  if (!loading.has(web.family)) {
    loading.set(web.family, new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fontURL(web);
      link.onload = link.onerror = resolve; // offline without a cached copy: fall back silently
      document.head.append(link);
    }));
  }
  return loading.get(web.family);
}
