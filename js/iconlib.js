// The big icon library: Phosphor Icons (MIT licence, https://phosphoricons.com), served by jsDelivr.
// icons/catalog.json lists names, categories, search tags and the occasion collections
// (built from @phosphor-icons/core 2.1.1, brand logos left out). A chosen icon's SVG is stored
// in the label itself, so it keeps printing offline.

const CDN = 'https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets';
export const ICON_STYLES = [['fill', 'Solid'], ['bold', 'Outline']];

export const iconURL = (name, style) => `${CDN}/${style}/${name}-${style}.svg`;

let catalog;
export function loadCatalog() {
  catalog ??= fetch(`icons/catalog.json?v=${window.APP_BUILD}`).then((r) => {
    if (!r.ok) throw new Error('Could not load the icon library');
    return r.json();
  }).catch((e) => { catalog = null; throw e; });
  return catalog;
}

// SVG text ready to store in a label. A fixed size is added because Safari can't
// draw an SVG image that has none.
export async function fetchIconSVG(name, style) {
  const r = await fetch(iconURL(name, style));
  if (!r.ok) throw new Error(`Could not download the “${name}” icon (are you offline?)`);
  return (await r.text()).replace('<svg ', '<svg width="256" height="256" ');
}
