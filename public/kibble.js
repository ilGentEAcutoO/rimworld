'use strict';

// อัตรากิน (โภชนาการ/วัน) ของสัตว์ตัวเต็มวัย — ยืนยันจากหน้าวิกิรายตัว 1.6 (เก็บ 13 ก.ย. 2569)
// diet: herb กินพืช · omni กินทั้งคู่ · carn กินเนื้อ · strict กินเนื้อเท่านั้น (กิน kibble ไม่ได้)
// tag: '' เกมหลัก · 'OD' Odyssey · 'B' Biotech · prod: ผลผลิตระหว่างเลี้ยง (ถ้ามี)
var ANIMALS = [
  { id: 'chicken', name: 'ไก่', rate: 0.22, diet: 'herb', tag: '', prod: 'ไข่' },
  { id: 'duck', name: 'เป็ด', rate: 0.28, diet: 'herb', tag: '', prod: 'ไข่' },
  { id: 'goose', name: 'ห่าน', rate: 0.45, diet: 'herb', tag: '', prod: 'ไข่' },
  { id: 'turkey', name: 'ไก่งวง', rate: 0.45, diet: 'herb', tag: '', prod: 'ไข่' },
  { id: 'cassowary', name: 'Cassowary', rate: 0.45, diet: 'herb', tag: '', prod: 'ไข่' },
  { id: 'emu', name: 'Emu', rate: 0.45, diet: 'herb', tag: '', prod: 'ไข่' },
  { id: 'ostrich', name: 'Ostrich', rate: 0.67, diet: 'herb', tag: '', prod: 'ไข่' },
  { id: 'guineapig', name: 'กินีพิก', rate: 0.16, diet: 'herb', tag: '', prod: '' },
  { id: 'chinchilla', name: 'ชินชิลลา', rate: 0.2, diet: 'herb', tag: '', prod: '' },
  { id: 'squirrel', name: 'กระรอก', rate: 0.16, diet: 'herb', tag: '', prod: '' },
  { id: 'hare', name: 'กระต่ายป่า', rate: 0.18, diet: 'herb', tag: '', prod: '' },
  { id: 'snowhare', name: 'กระต่ายหิมะ', rate: 0.18, diet: 'herb', tag: '', prod: '' },
  { id: 'capybara', name: 'คาปิบารา', rate: 0.36, diet: 'herb', tag: '', prod: '' },
  { id: 'goat', name: 'แพะ', rate: 0.36, diet: 'herb', tag: '', prod: 'นม' },
  { id: 'sheep', name: 'แกะ', rate: 0.36, diet: 'herb', tag: '', prod: 'ขน' },
  { id: 'alpaca', name: 'Alpaca', rate: 0.44, diet: 'herb', tag: '', prod: 'ขน' },
  { id: 'cow', name: 'วัว', rate: 0.86, diet: 'herb', tag: '', prod: 'นม' },
  { id: 'yak', name: 'Yak', rate: 0.86, diet: 'herb', tag: '', prod: 'นม' },
  { id: 'horse', name: 'ม้า', rate: 0.86, diet: 'herb', tag: '', prod: '' },
  { id: 'donkey', name: 'ลา', rate: 0.52, diet: 'herb', tag: '', prod: '' },
  { id: 'dromedary', name: 'อูฐ', rate: 0.86, diet: 'herb', tag: '', prod: 'นม' },
  { id: 'muffalo', name: 'Muffalo', rate: 0.86, diet: 'herb', tag: '', prod: 'ขน' },
  { id: 'bison', name: 'Bison', rate: 0.86, diet: 'herb', tag: '', prod: 'ขน' },
  { id: 'boomalope', name: 'Boomalope', rate: 0.86, diet: 'herb', tag: '', prod: 'เชื้อเพลิง' },
  { id: 'elephant', name: 'ช้าง', rate: 2.57, diet: 'herb', tag: '', prod: '' },
  { id: 'rhinoceros', name: 'แรด', rate: 1.71, diet: 'herb', tag: '', prod: '' },
  { id: 'megasloth', name: 'Megasloth', rate: 1.6, diet: 'herb', tag: '', prod: 'ขน' },
  { id: 'thrumbo', name: 'Thrumbo', rate: 2.8, diet: 'herb', tag: '', prod: '' },
  { id: 'alphabeaver', name: 'Alphabeaver', rate: 4.8, diet: 'herb', tag: '', prod: '' },
  { id: 'pig', name: 'หมู', rate: 0.8, diet: 'omni', tag: '', prod: '' },
  { id: 'boar', name: 'หมูป่า', rate: 0.48, diet: 'omni', tag: '', prod: '' },
  { id: 'iguana', name: 'อิกัวนา', rate: 0.32, diet: 'omni', tag: '', prod: 'ไข่' },
  { id: 'tortoise', name: 'เต่า', rate: 0.13, diet: 'omni', tag: '', prod: 'ไข่' },
  { id: 'monkey', name: 'ลิง', rate: 0.2, diet: 'omni', tag: '', prod: '' },
  { id: 'raccoon', name: 'แรคคูน', rate: 0.32, diet: 'omni', tag: '', prod: '' },
  { id: 'husky', name: 'Husky', rate: 0.8, diet: 'omni', tag: '', prod: '' },
  { id: 'labrador', name: 'ลาบราดอร์', rate: 0.64, diet: 'omni', tag: '', prod: '' },
  { id: 'yorkie', name: 'Yorkshire terrier', rate: 0.24, diet: 'omni', tag: '', prod: '' },
  { id: 'grizzly', name: 'หมีกริซลี', rate: 0.56, diet: 'omni', tag: '', prod: '' },
  { id: 'polarbear', name: 'หมีขั้ว', rate: 0.56, diet: 'omni', tag: '', prod: '' },
  { id: 'boomrat', name: 'Boomrat', rate: 0.22, diet: 'omni', tag: '', prod: '' },
  { id: 'rat', name: 'หนู', rate: 0.16, diet: 'omni', tag: '', prod: '' },
  { id: 'cat', name: 'แมว', rate: 0.24, diet: 'carn', tag: '', prod: '' },
  { id: 'cobra', name: 'งูเห่า', rate: 0.11, diet: 'carn', tag: '', prod: 'ไข่' },
  { id: 'timberwolf', name: 'หมาป่า', rate: 0.29, diet: 'carn', tag: '', prod: '' },
  { id: 'arcticwolf', name: 'หมาป่าขั้ว', rate: 0.29, diet: 'carn', tag: '', prod: '' },
  { id: 'panther', name: 'เสือดำ', rate: 0.32, diet: 'carn', tag: '', prod: '' },
  { id: 'cougar', name: 'พูมา', rate: 0.32, diet: 'carn', tag: '', prod: '' },
  { id: 'lynx', name: 'ลินซ์', rate: 0.19, diet: 'carn', tag: '', prod: '' },
  { id: 'redfox', name: 'จิ้งจอกแดง', rate: 0.16, diet: 'carn', tag: '', prod: '' },
  { id: 'arcticfox', name: 'จิ้งจอกขั้ว', rate: 0.16, diet: 'carn', tag: '', prod: '' },
  { id: 'fennecfox', name: 'จิ้งจอกฟีเนค', rate: 0.16, diet: 'carn', tag: '', prod: '' },
  { id: 'warg', name: 'Warg', rate: 0.4, diet: 'strict', tag: '', prod: '' },
  { id: 'hippo', name: 'ฮิปโป', rate: 1.6, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'moose', name: 'มูส', rate: 0.86, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'muskox', name: 'Muskox', rate: 0.86, diet: 'herb', tag: 'OD', prod: 'ขน' },
  { id: 'panda', name: 'แพนด้า', rate: 0.32, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'mastodon', name: 'Mastodon', rate: 2.88, diet: 'herb', tag: 'OD', prod: 'ขน' },
  { id: 'porcupine', name: 'เม่น', rate: 0.24, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'prairiedog', name: 'แพร์รีด็อก', rate: 0.16, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'lavasnail', name: 'Lava snail', rate: 0.32, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'peafowl', name: 'นกยูง', rate: 0.37, diet: 'herb', tag: 'OD', prod: 'ไข่' },
  { id: 'quail', name: 'นกควาย', rate: 0.19, diet: 'herb', tag: 'OD', prod: 'ไข่' },
  { id: 'swan', name: 'หงส์', rate: 0.45, diet: 'herb', tag: 'OD', prod: 'ไข่' },
  { id: 'macaw', name: 'มะคอว์', rate: 0.19, diet: 'herb', tag: 'OD', prod: 'ไข่' },
  { id: 'bluebird', name: 'บลูเบิร์ด', rate: 0.13, diet: 'herb', tag: 'OD', prod: 'ไข่' },
  { id: 'sparrow', name: 'นกกระจอก', rate: 0.13, diet: 'herb', tag: 'OD', prod: 'ไข่' },
  { id: 'alphathrumbo', name: 'Alpha thrumbo', rate: 2.8, diet: 'herb', tag: 'OD', prod: '' },
  { id: 'gorilla', name: 'กอริลลา', rate: 0.86, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'badger', name: 'แบดเจอร์', rate: 0.32, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'armadillo', name: 'อาร์มาดิลโล', rate: 0.32, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'otter', name: 'นาก', rate: 0.24, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'mink', name: 'มิงก์', rate: 0.16, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'boghound', name: 'Bog hound', rate: 0.29, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'megavole', name: 'Megavole', rate: 0.8, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'crow', name: 'อีกา', rate: 0.13, diet: 'omni', tag: 'OD', prod: 'ไข่' },
  { id: 'flamingo', name: 'ฟลามิงโก', rate: 0.45, diet: 'omni', tag: 'OD', prod: 'ไข่' },
  { id: 'heron', name: 'นกกระสา', rate: 0.45, diet: 'omni', tag: 'OD', prod: 'ไข่' },
  { id: 'seaturtle', name: 'เต่าทะเล', rate: 0.16, diet: 'omni', tag: 'OD', prod: 'ไข่' },
  { id: 'monitorlizard', name: 'Monitor lizard', rate: 0.32, diet: 'omni', tag: 'OD', prod: 'ไข่' },
  { id: 'bullfrog', name: 'บูลฟรอก', rate: 0.16, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'colossustoad', name: 'Colossus toad', rate: 0.32, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'hermitcrab', name: 'ปูเจ้าสำนัก', rate: 0.13, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'stonecrab', name: 'ปูหิน', rate: 0.19, diet: 'omni', tag: 'OD', prod: '' },
  { id: 'greatwolf', name: 'Greatwolf', rate: 0.64, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'scimitarcat', name: 'Scimitar cat', rate: 0.42, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'tiger', name: 'เสือโคร่ง', rate: 0.32, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'walrus', name: 'วอลรัส', rate: 0.86, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'sealion', name: 'สิงโตทะเล', rate: 0.48, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'seal', name: 'แมวน้ำ', rate: 0.48, diet: 'carn', tag: 'OD', prod: '' },
  { id: 'penguin', name: 'เพนกวิน', rate: 0.45, diet: 'carn', tag: 'OD', prod: 'ไข่' },
  { id: 'alligator', name: 'Alligator', rate: 0.48, diet: 'carn', tag: 'OD', prod: 'ไข่' },
  { id: 'wolverine', name: 'Wolverine', rate: 0.37, diet: 'strict', tag: 'OD', prod: '' },
  { id: 'vulture', name: 'Vulture', rate: 0.37, diet: 'strict', tag: 'OD', prod: 'ไข่' },
  { id: 'toxalope', name: 'Toxalope', rate: 0.86, diet: 'herb', tag: 'B', prod: '' }
];

var DIET_LABEL = { herb: 'กินพืช', omni: 'กินทั้งคู่', carn: 'กินเนื้อ', strict: 'เนื้อเท่านั้น' };

// สูตร: 20 เนื้อ + 20 ผัก ต่อรอบ — Butcher table ได้ 50 ชิ้น (125%) · Butcher spot ได้ 35 (87.5%)
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

// เปิดมาครั้งแรกแสดงแค่ชุดตัวอย่างนี้ — 96 ตัวโชว์หมดจะรกเกิน ให้ค้นหาแล้วกดเพิ่มเอง
var STARTER = ['chicken', 'cat', 'pig', 'husky', 'cow', 'warg'];

var DEFAULT_COUNTS = {
  chicken: 6, cat: 1, pig: 2, husky: 2, cow: 1, warg: 1
};

function clampInt(n, lo, hi) {
  var x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(x)));
}

// ทำ kibble เป็นรอบทุก N วัน (bill "จนมี ~X" ตั้งครั้งเดียวต่อรอบ) — 1–10 วัน
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

// รับได้ทั้ง object {chicken: 6} และ string 'chicken:6,husky:2' (จาก URL)
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

// รายการสัตว์ที่เลือกแสดง: รับ array หรือ string 'chicken,cat' (จาก URL)
// ไม่มีค่า = ชุดตัวอย่างเริ่มต้น · ค่าว่าง = ไม่เหลือตัวไหน · id ที่ไม่รู้จักทิ้ง · เรียงตามลำดับ ANIMALS
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

// ค้นหาสัตว์จากชื่อไทยหรือ id อังกฤษ — pure function ให้ UI และเทสใช้ร่วมกัน
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

// raw = ส่วนของ state ที่เกี่ยวกับแท็บสัตว์ (จาก localStorage / URL / เซิร์ฟเวอร์)
// รับ an = 'chicken:6,husky:2' · kb = 'table'|'spot' · kcycle = วันต่อรอบทำ 1–10
// kshown = รายการที่เลือกแสดง (array หรือ 'chicken,cat') — ไม่มีค่าเลย → ชุดตัวอย่าง
// kbuf ของเก่าถูกเมิน (เลิกเผื่อกันเหนียวแล้ว) · มี an แต่ว่าง → ล้างศูนย์ทั้งหมด
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
