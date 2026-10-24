// Builds icons/catalog.json from the Phosphor Icons metadata.
// Download https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/dist/index.mjs next to this
// script, then run: node tools/build-icon-catalog.mjs icons/catalog.json
import { icons } from './index.mjs';
import fs from 'node:fs';
const CATEGORIES = [
  ['health & wellness', 'Health & medical'], ['commerce', 'Shopping'], ['objects', 'Objects'], ['nature', 'Nature'],
  ['weather', 'Weather'], ['people', 'People'], ['maps & travel', 'Travel & places'], ['games', 'Games & sports'],
  ['finances', 'Money'], ['office', 'Office'], ['communications', 'Communication'], ['media', 'Media'],
  ['technology & development', 'Technology'], ['design', 'Design'], ['editor', 'Editing'], ['arrows', 'Arrows'], ['system', 'System'],
];
const OCCASIONS = {
  'Holidays & parties': 'gift cake balloon confetti champagne wine beer-stein martini party-popper tree-evergreen snowflake snowman star sparkle sparkle ghost skull jack-o-lantern bat spider egg egg-crack rabbit flag fire moon-stars firework calendar-star crown music-notes microphone-stage mask-happy cookie candy',
  'Love & wedding': 'heart hearts heart-straight heart-half hand-heart flower flower-tulip flower-lotus flower-tulip diamond diamonds-four crown ring rings sparkle envelope-open church champagne gift',
  'Baby & kids': 'baby baby-carriage teddy-bear puzzle-piece balloon star moon moon-stars smiley butterfly rainbow ice-cream sun-horizon cookie',
  'Kitchen & food': 'cooking-pot fork-knife knife bowl-food bowl-steam pizza hamburger carrot avocado pepper orange-slice orange coffee coffee-bean wine beer-bottle beer-stein martini cookie bread cheese egg fish cake ice-cream popsicle cherries grains jar jar-label shrimp cow drop thermometer-cold thermometer-hot snowflake fire oven microwave refrigerator salt shaker chef-hat cooking-pot hamburger hot-dog',
  'Medical & pharmacy': 'pill syringe first-aid first-aid-kit bandaids heartbeat heart thermometer stethoscope tooth eyedropper flask test-tube dna virus wheelchair hospital prescription drop clock calendar-check face-mask brain bone hand-heart',
  'Home & storage': 'house house-line couch bed bathtub toilet shower lamp lightbulb key lock archive-box package toolbox wrench hammer broom washing-machine plug battery-full door garage armchair television drawer basket',
  'Garden & plants': 'plant potted-plant flower flower-tulip leaf tree tree-palm cactus shovel drop sun plant flower-lotus grains acorn',
  'Pets & animals': 'dog cat paw-print fish fish-simple bird rabbit horse bone cow butterfly bug bug-beetle cow kangaroo shrimp spider bat',
  'Shipping & office': 'package truck envelope envelope-simple address-book map-pin barcode qr-code tag clipboard clipboard-text folder file printer phone paper-plane-tilt stamp archive briefcase calendar storefront',
  'School & crafts': 'book books book-open graduation-cap pencil pen ruler scissors paint-brush palette backpack calculator chalkboard student notebook paperclip push-pin highlighter needle',
  'Sports & fitness': 'barbell basketball soccer-ball football baseball tennis-ball volleyball bicycle person-simple-run person-simple-bike person-simple-swim trophy medal sneaker swimming-pool golf boxing-glove timer',
  'Travel & outdoors': 'airplane airplane-tilt suitcase suitcase-rolling globe map-trifold compass car bus train boat tent mountains camera ticket umbrella sun-horizon island campfire binoculars anchor',
  'Weather & seasons': 'sun cloud cloud-rain cloud-snow cloud-lightning snowflake lightning rainbow umbrella wind thermometer leaf moon sun-dim drop',
  'Warnings & safety': 'warning warning-circle warning-octagon prohibit fire radioactive biohazard skull hand-palm lightning shield-check info question fire-extinguisher siren',
};
// Extra search words, so people can search by occasion ("christmas", "wedding"...).
const EXTRA_TAGS = {
  christmas: 'tree-evergreen snowflake gift star sparkle bell church candle cookie',
  halloween: 'ghost skull bug moon-stars moon cat fire mask-sad',
  easter: 'egg egg-crack rabbit flower-tulip flower basket sun',
  valentine: 'heart heart-straight heart-half hand-heart flower flower-tulip envelope-open diamond gift',
  wedding: 'heart diamond diamonds-four church champagne flower flower-lotus crown cake envelope-open camera',
  birthday: 'cake balloon gift confetti party champagne crown star calendar-star music-notes',
  'new year': 'confetti champagne sparkle star clock calendar-star wine martini',
  thanksgiving: 'cooking-pot fork-knife bread leaf acorn grains bowl-food wine pie',
  'fourth of july': 'flag star fire sparkle sun',
  baby: 'baby baby-carriage moon-stars star smiley puzzle-piece balloon',
  'baby shower': 'baby baby-carriage gift balloon cake heart',
  graduation: 'graduation-cap student certificate books trophy medal confetti',
  kitchen: 'cooking-pot fork-knife knife bowl-food oven chef-hat jar jar-label coffee',
  pantry: 'jar jar-label grains bread egg coffee-bean package',
  freezer: 'snowflake thermometer-cold ice-cream fish',
  medicine: 'pill syringe first-aid first-aid-kit bandaids thermometer eyedropper prescription',
  pharmacy: 'pill syringe first-aid prescription eyedropper flask',
  moving: 'package truck house archive key',
  storage: 'package archive basket toolbox',
  garden: 'plant potted-plant flower leaf tree shovel drop sun cactus',
  pets: 'dog cat paw-print fish bird bone rabbit',
  school: 'book books pencil backpack ruler scissors graduation-cap chalkboard',
  office: 'briefcase folder file clipboard printer paperclip push-pin calendar',
  shipping: 'package truck envelope stamp barcode qr-code map-pin tag',
  travel: 'airplane suitcase suitcase-rolling globe map-trifold compass passport ticket camera',
  camping: 'tent campfire mountains compass binoculars tree',
  sports: 'basketball soccer-ball football baseball tennis-ball volleyball trophy medal barbell',
  gym: 'barbell sneaker timer person-simple-run heartbeat',
  danger: 'warning warning-circle warning-octagon prohibit skull radioactive biohazard fire siren',
  fragile: 'warning hand-palm wine package',
};
const extra = {};
for (const [word, list] of Object.entries(EXTRA_TAGS)) for (const n of list.split(' ')) (extra[n] ??= []).push(word);
const names = new Set(icons.map((i) => i.name));
const occasions = {};
const missing = [];
for (const [title, list] of Object.entries(OCCASIONS)) {
  const found = [...new Set(list.split(' '))].filter((n) => names.has(n) || (missing.push(n), false));
  occasions[title] = found;
}
const catIndex = Object.fromEntries(CATEGORIES.map(([k], i) => [k, i]));
const out = icons
  .filter((i) => !i.categories.includes('brands'))
  .map((i) => [i.name, catIndex[i.categories.find((c) => c in catIndex)] ?? CATEGORIES.length - 1, [...i.tags.filter((t) => !t.startsWith('*')), ...(extra[i.name] ?? [])].join(' ').toLowerCase()]);
const catalog = { source: 'Phosphor Icons 2.1.1 (MIT), https://phosphoricons.com', categories: CATEGORIES.map(([, t]) => t), occasions, icons: out };
fs.writeFileSync(process.argv[2], JSON.stringify(catalog));
console.log('icons', out.length, 'occasions', Object.fromEntries(Object.entries(occasions).map(([k, v]) => [k, v.length])), 'missing', [...new Set(missing)].join(' '));
