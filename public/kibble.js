'use strict';

// Hunger rate (nutrition/day) of adult animals — verified per-species from the wiki, 1.6 (collected Sep 13, 2026)
// diet: herb herbivore · omni omnivore · carn carnivore · strict meat only (cannot eat kibble)
// tag: '' base game · 'OD' Odyssey · 'B' Biotech · prod: output while kept (if any)
var ANIMALS = [
  { id: 'chicken', name: 'Chicken', rate: 0.22, diet: 'herb', tag: '', prod: 'Eggs' },
  { id: 'duck', name: 'Duck', rate: 0.28, diet: 'herb', tag: '', prod: 'Eggs' },
  { id: 'goose', name: 'Goose', rate: 0.45, diet: 'herb', tag: '', prod: 'Eggs' },
  { id: 'turkey', name: 'Turkey', rate: 0.45, diet: 'herb', tag: '', prod: 'Eggs' },
  { id: 'cassowary', name: 'Cassowary', rate: 0.45, diet: 'herb', tag: '', prod: 'Eggs' },
  { id: 'emu', name: 'Emu', rate: 0.45, diet: 'herb', tag: '', prod: 'Eggs' },
  { id: 'ostrich', name: 'Ostrich', rate: 0.67, diet: 'herb', tag: '', prod: 'Eggs' },
  { id: 'guineapig', name: 'Guinea pig', rate: 0.16, diet: 'herb', tag: '', prod: '' },
  { id: 'chinchilla', name: 'Chinchilla', rate: 0.2, diet: 'herb', tag: '', prod: '' },
  { id: 'squirrel', name: 'Squirrel', rate: 0.16, diet: 'herb', tag: '', prod: '' },
  { id: 'hare', name: 'Hare', rate: 0.18, diet: 'herb', tag: '', prod: '' },
  { id: 'snowhare', name: 'Snowhare', rate: 0.18, diet: 'herb', tag: '', prod: '' },
  { id: 'capybara', name: 'Capybara', rate: 0.36, diet: 'herb', tag: '', prod: '' },
  { id: 'goat', name: 'Goat', rate: 0.36, diet: 'herb', tag: '', prod: 'Milk' },
  { id: 'sheep', name: 'Sheep', rate: 0.36, diet: 'herb', tag: '', prod: 'Wool' },
  { id: 'alpaca', name: 'Alpaca', rate: 0.44, diet: 'herb', tag: '', prod: 'Wool' },
  { id: 'cow', name: 'Cow', rate: 0.86, diet: 'herb', tag: '', prod: 'Milk' },
  { id: 'yak', name: 'Yak', rate: 0.86, diet: 'herb', tag: '', prod: 'Milk' },
  { id: 'horse', name: 'Horse', rate: 0.86, diet: 'herb', tag: '', prod: '' },
  { id: 'donkey', name: 'Donkey', rate: 0.52, diet: 'herb', tag: '', prod: '' },
  { id: 'dromedary', name: 'Dromedary', rate: 0.86, diet: 'herb', tag: '', prod: 'Milk' },
  { id: 'muffalo', name: 'Muffalo', rate: 0.86, diet: 'herb', tag: '', prod: 'Wool' },
  { id: 'bison', name: 'Bison', rate: 0.86, diet: 'herb', tag: '', prod: 'Wool' },
  { id: 'boomalope', name: 'Boomalope', rate: 0.86, diet: 'herb', tag: '', prod: 'Chemfuel' },
  { id: 'elephant', name: 'Elephant', rate: 2.57, diet: 'herb', tag: '', prod: '' },
  { id: 'rhinoceros', name: 'Rhinoceros', rate: 1.71, diet: 'herb', tag: '', prod: '' },
  { id: 'megasloth', name: 'Megasloth', rate: 1.6, diet: 'herb', tag: '', prod: 'Wool' },
  { id: 'thrumbo', name: 'Thrumbo', rate: 2.8, diet: 'herb', tag: '', prod: '' },
  { id: 'alphabeaver', name: 'Alphabeaver', rate: 4.8, diet: 'herb', tag: '', prod: '' },
  { id: 'pig', name: 'Pig', rate: 0.8, diet: 'omni', tag: '', prod: '' },
  { id: 'boar', name: 'Wild boar', rate: 0.48, diet: 'omni', tag: '', prod: '' },
  { id: 'iguana', name: 'Iguana', rate: 0.32, diet: 'omni', tag: '', prod: 'Eggs' },
  { id: 'tortoise', name: 'Tortoise', rate: 0.13, diet: 'omni', tag: '', prod: 'Eggs' },
  { id: 'monkey', name: 'Monkey', rate: 0.2, diet: 'omni', tag: '', prod: '' },
  { id: 'raccoon', name: 'Raccoon', rate: 0.32, diet: 'omni', tag: '', prod: '' },
  { id: 'husky', name: 'Husky', rate: 0.8, diet: 'omni', tag: '', prod: '' },
  { id: 'labrador', name: 'Labrador retriever', rate: 0.64, diet: 'omni', tag: '', prod: '' },
  { id: 'yorkie', name: 'Yorkshire terrier', rate: 0.24, diet: 'omni', tag: '', prod: '' },
  { id: 'grizzly', name: 'Grizzly bear', rate: 0.56, diet: 'omni', tag: '', prod: '' },
  { id: 'polarbear', name: 'Polar bear', rate: 0.56, diet: 'omni', tag: '', prod: '' },
  { id: 'boomrat', name: 'Boomrat', rate: 0.22, diet: 'omni', tag: '', prod: '' },
  { id: 'rat', name: 'Rat', rate: 0.16, diet: 'omni', tag: '', prod: '' },
  { id: 'cat', name: 'Cat', rate: 0.24, diet: 'carn', tag: '', prod: '' },
  { id: 'cobra', name: 'Cobra', rate: 0.11, diet: 'carn', tag: '', prod: 'Eggs' },
  { id: 'timberwolf', name: 'Timber wolf', rate: 0.29, diet: 'carn', tag: '', prod: '' },
  { id: 'arcticwolf', name: 'Arctic wolf', rate: 0.29, diet: 'carn', tag: '', prod: '' },
  { id: 'panther', name: 'Panther', rate: 0.32, diet: 'carn', tag: '', prod: '' },
  { id: 'cougar', name: 'Cougar', rate: 0.32, diet: 'carn', tag: '', prod: '' },
  { id: 'lynx', name: 'Lynx', rate: 0.19, diet: 'carn', tag: '', prod: '' },
  { id: 'redfox', name: 'Red fox', rate: 0.16, diet: 'carn', tag: '', prod: '' },
  { id: 'arcticfox', name: 'Arctic fox', rate: 0.16, diet: 'carn', tag: '', prod: '' },
  { id: 'fennecfox', name: 'Fennec fox', rate: 0.16, diet: 'carn', tag: '', prod: '' },
  { id: 'warg', name: 'Warg', rate: 0.4, diet: 'strict', tag: '', prod: '' },
  { id: 'hippo', name: 'Hippo', rate: 1.6, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'moose', name: 'Moose', rate: 0.86, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'muskox', name: 'Muskox', rate: 0.86, diet: 'herb', tag: 'OD', prod: 'Wool' },
  { id: 'panda', name: 'Panda', rate: 0.32, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'mastodon', name: 'Mastodon', rate: 2.88, diet: 'herb', tag: 'OD', prod: 'Wool' },
  { id: 'porcupine', name: 'Porcupine', rate: 0.24, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'prairiedog', name: 'Prairie dog', rate: 0.16, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'lavasnail', name: 'Lava snail', rate: 0.32, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'peafowl', name: 'Peafowl', rate: 0.37, diet: 'herb', tag: 'OD', prod: 'Eggs' },
  { id: 'quail', name: 'Quail', rate: 0.19, diet: 'herb', tag: 'OD', prod: 'Eggs' },
  { id: 'swan', name: 'Swan', rate: 0.45, diet: 'herb', tag: 'OD', prod: 'Eggs' },
  { id: 'macaw', name: 'Macaw', rate: 0.19, diet: 'herb', tag: 'OD', prod: 'Eggs' },
  { id: 'bluebird', name: 'Bluebird', rate: 0.13, diet: 'herb', tag: 'OD', prod: 'Eggs' },
  { id: 'sparrow', name: 'Sparrow', rate: 0.13, diet: 'herb', tag: 'OD', prod: 'Eggs' },
  { id: 'alphathrumbo', name: 'Alpha thrumbo', rate: 2.8, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'gorilla', name: 'Gorilla', rate: 0.86, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'badger', name: 'Badger', rate: 0.32, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'armadillo', name: 'Armadillo', rate: 0.32, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'otter', name: 'Otter', rate: 0.24, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'mink', name: 'Mink', rate: 0.16, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'boghound', name: 'Bog hound', rate: 0.29, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'megavole', name: 'Megavole', rate: 0.8, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'crow', name: 'Crow', rate: 0.13, diet: 'omni', tag: 'OD', prod: 'Eggs' },
  { id: 'flamingo', name: 'Flamingo', rate: 0.45, diet: 'omni', tag: 'OD', prod: 'Eggs' },
  { id: 'heron', name: 'Heron', rate: 0.45, diet: 'omni', tag: 'OD', prod: 'Eggs' },
  { id: 'seaturtle', name: 'Sea turtle', rate: 0.16, diet: 'omni', tag: 'OD', prod: 'Eggs' },
  { id: 'monitorlizard', name: 'Monitor lizard', rate: 0.32, diet: 'omni', tag: 'OD', prod: 'Eggs' },
  { id: 'bullfrog', name: 'Bullfrog', rate: 0.16, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'colossustoad', name: 'Colossus toad', rate: 0.32, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'hermitcrab', name: 'Hermit crab', rate: 0.13, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'stonecrab', name: 'Stone crab', rate: 0.19, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'greatwolf', name: 'Greatwolf', rate: 0.64, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'scimitarcat', name: 'Scimitar cat', rate: 0.42, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'tiger', name: 'Tiger', rate: 0.32, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'walrus', name: 'Walrus', rate: 0.86, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'sealion', name: 'Sea lion', rate: 0.48, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'seal', name: 'Seal', rate: 0.48, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'penguin', name: 'Penguin', rate: 0.45, diet: 'carn', tag: 'OD', prod: 'Eggs' },
  { id: 'alligator', name: 'Alligator', rate: 0.48, diet: 'carn', tag: 'OD', prod: 'Eggs' },
  { id: 'wolverine', name: 'Wolverine', rate: 0.37, diet: 'strict', tag: 'OD', prod: '' },
  { id: 'vulture', name: 'Vulture', rate: 0.37, diet: 'strict', tag: 'OD', prod: 'Eggs' },
  { id: 'toxalope', name: 'Toxalope', rate: 0.86, diet: 'herb', tag: 'B', prod: '' }
];

var DIET_LABEL = { herb: 'Herbivore', omni: 'Omnivore', carn: 'Carnivore', strict: 'Meat only' };

// Recipe: 20 meat + 20 veg per batch — Butcher table yields 50 (125%) · Butcher spot yields 35 (87.5%)
var STATIONS = {
  table: { id: 'table', name: 'Butcher table', outNut: 2.5, batch: 50 },
  spot: { id: 'spot', name: 'Butcher spot', outNut: 1.75, batch: 35 }
};

var KIBBLE_NUT = 0.05;
var BATCH_IN = 20;
var MAX_PER_ANIMAL = 50;
var DEFAULT_CYCLE = 3;
var MAX_CYCLE = 10;
var QUADRUM_DAYS = 15;
var RICE_REAL_DAYS_SOIL = 5.54;
var RICE_YIELD = 6;

// First open shows only this starter set — showing all 95 at once is too noisy; search and add your own
var STARTER = ['chicken', 'cat', 'pig', 'husky', 'cow', 'warg'];

var DEFAULT_COUNTS = {
  chicken: 6, cat: 1, pig: 2, husky: 2, cow: 1, warg: 1
};

function clampInt(n, lo, hi) {
  var x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(x)));
}

// Kibble is cooked in cycles of N days (one "until you have ~X" bill per cycle) — 1–10 days
function clampCycle(n) {
  var x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_CYCLE;
  return Math.max(1, Math.min(MAX_CYCLE, Math.trunc(x)));
}

function animalById(id) {
  for (var i = 0; i < ANIMALS.length; i++) {
    if (ANIMALS[i].id === id) return ANIMALS[i];
  }
  return null;
}

function zeroCounts() {
  var o = {};
  ANIMALS.forEach(function (a) { o[a.id] = 0; });
  return o;
}

// Accepts both an object {chicken: 6} and a string 'chicken:6,husky:2' (from the URL)
function parseCounts(raw) {
  var out = zeroCounts();
  if (typeof raw === 'string') {
    raw.split(',').forEach(function (part) {
      var seg = part.trim();
      if (!seg) return;
      var i = seg.indexOf(':');
      if (i <= 0) return;
      var id = seg.slice(0, i).trim();
      if (animalById(id)) out[id] = clampInt(seg.slice(i + 1), 0, MAX_PER_ANIMAL);
    });
    return out;
  }
  var src = raw && typeof raw === 'object' ? raw : {};
  ANIMALS.forEach(function (a) {
    if (Object.prototype.hasOwnProperty.call(src, a.id)) {
      out[a.id] = clampInt(src[a.id], 0, MAX_PER_ANIMAL);
    }
  });
  return out;
}

function parseStation(v) {
  return STATIONS[v] ? v : 'table';
}

function allShown() {
  return ANIMALS.map(function (a) { return a.id; });
}

// Shown-animal list: accepts an array or 'chicken,cat' (from the URL)
// Missing = starter set · empty = nothing shown · unknown ids dropped · ordered like ANIMALS
function parseShownList(raw) {
  if (raw == null) return STARTER.slice();
  var arr = Array.isArray(raw)
    ? raw.map(function (x) { return String(x); })
    : String(raw).split(',');
  var keep = {};
  arr.forEach(function (id) {
    var k = id.trim();
    if (k) keep[k] = true;
  });
  return ANIMALS.filter(function (a) { return keep[a.id]; })
    .map(function (a) { return a.id; });
}

function isStarterShown(shown) {
  var list = parseShownList(shown);
  if (list.length !== STARTER.length) return false;
  return STARTER.every(function (id) { return list.indexOf(id) >= 0; });
}

// Search animals by display name or id — pure function shared by UI and tests
function filterAnimals(query, list) {
  var q = String(query || '').trim().toLowerCase();
  var src = list || ANIMALS;
  if (!q) return src.slice();
  return src.filter(function (a) {
    return a.name.toLowerCase().indexOf(q) >= 0 || a.id.indexOf(q) >= 0;
  });
}

function encodeCounts(counts) {
  var src = parseCounts(counts);
  return ANIMALS.filter(function (a) { return src[a.id] > 0; })
    .map(function (a) { return a.id + ':' + src[a.id]; }).join(',');
}

function ceilCount(x) {
  if (x <= 1e-12) return 0;
  return Math.ceil(x - 1e-9);
}

function planKibble(input) {
  var src = input || {};
  var counts = parseCounts(src.counts);
  var shown = parseShownList(src.shown);
  var station = STATIONS[parseStation(src.station)];
  var cycleDays = clampCycle(src.cycleDays != null ? src.cycleDays : src.cycle);

  var nutrition = 0;
  var strictNutrition = 0;
  var strictCount = 0;
  var strictNames = [];
  var total = 0;
  ANIMALS.forEach(function (a) {
    var n = shown.indexOf(a.id) >= 0 ? (counts[a.id] || 0) : 0;
    total += n;
    if (a.diet === 'strict') {
      strictNutrition += a.rate * n;
      strictCount += n;
      if (n > 0) strictNames.push(a.name);
    } else {
      nutrition += a.rate * n;
    }
  });

  var pieces = nutrition / KIBBLE_NUT;
  var ingExact = nutrition / station.outNut * BATCH_IN;
  var cyclePieces = ceilCount(pieces * cycleDays);

  return {
    counts: counts,
    shown: shown,
    station: station.id,
    cycleDays: cycleDays,
    animalTotal: total,
    strictCount: strictCount,
    strictNames: strictNames,
    nutrition: nutrition,
    strictNutrition: strictNutrition,
    pieces: pieces,
    piecesDay: ceilCount(pieces),
    cyclePieces: cyclePieces,
    billsPerCycle: ceilCount(cyclePieces / station.batch),
    billsDay: ceilCount(pieces / station.batch),
    meatUnits: ceilCount(ingExact),
    vegUnits: ceilCount(ingExact),
    meatPerCycle: ceilCount(ingExact * cycleDays),
    vegPerCycle: ceilCount(ingExact * cycleDays),
    ricePlants: ceilCount(ingExact * RICE_REAL_DAYS_SOIL / RICE_YIELD),
    strictMeatUnits: ceilCount(strictNutrition / KIBBLE_NUT),
    strictMeatPerCycle: ceilCount(strictNutrition * cycleDays / KIBBLE_NUT),
    quadrumPieces: ceilCount(pieces * QUADRUM_DAYS)
  };
}

// raw = the animal-tab slice of state (localStorage / URL / server)
// an = 'chicken:6,husky:2' · kb = 'table'|'spot' · kcycle = days per cook cycle 1–10
// kshown = shown list (array or 'chicken,cat') — absent → starter set
// legacy kbuf is ignored (no more safety margin) · an present but empty → zero everything
function parseKibbleState(raw) {
  var src = raw || {};
  var hasCounts = src.an != null || src.counts != null;
  return {
    counts: parseCounts(hasCounts ? (src.an != null ? src.an : src.counts) : DEFAULT_COUNTS),
    station: parseStation(src.kb != null ? src.kb : src.station),
    cycle: clampCycle(src.kcycle != null ? src.kcycle : src.cycle),
    shown: parseShownList(src.kshown != null ? src.kshown : src.shown)
  };
}

function defaultKibbleState() {
  return {
    counts: parseCounts(DEFAULT_COUNTS),
    station: 'table',
    cycle: DEFAULT_CYCLE,
    shown: STARTER.slice()
  };
}

var api = {
  ANIMALS: ANIMALS,
  DIET_LABEL: DIET_LABEL,
  STATIONS: STATIONS,
  KIBBLE_NUT: KIBBLE_NUT,
  QUADRUM_DAYS: QUADRUM_DAYS,
  STARTER: STARTER,
  DEFAULT_COUNTS: DEFAULT_COUNTS,
  clampInt: clampInt,
  clampCycle: clampCycle,
  animalById: animalById,
  parseCounts: parseCounts,
  parseStation: parseStation,
  parseShownList: parseShownList,
  isStarterShown: isStarterShown,
  filterAnimals: filterAnimals,
  encodeCounts: encodeCounts,
  planKibble: planKibble,
  parseKibbleState: parseKibbleState,
  defaultKibbleState: defaultKibbleState
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.KibbleCalc = api;
}
