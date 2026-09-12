'use strict';

// อัตรากิน (โภชนาการ/วัน) ของสัตว์ตัวเต็มวัย — ยืนยันจากหน้าวิกิของแต่ละตัว 1.6
// diet: herb กินพืช · omni กินทั้งคู่ · carn กินเนื้อ · strict = warg กินเนื้อเท่านั้น
var ANIMALS = [
  { id: 'chicken', name: 'ไก่', rate: 0.22, diet: 'herb' },
  { id: 'cat', name: 'แมว', rate: 0.24, diet: 'carn' },
  { id: 'alpaca', name: 'Alpaca', rate: 0.44, diet: 'herb' },
  { id: 'pig', name: 'หมู', rate: 0.8, diet: 'omni' },
  { id: 'husky', name: 'Husky', rate: 0.8, diet: 'omni' },
  { id: 'horse', name: 'ม้า', rate: 0.86, diet: 'herb' },
  { id: 'cow', name: 'วัว', rate: 0.86, diet: 'herb' },
  { id: 'muffalo', name: 'Muffalo', rate: 0.86, diet: 'herb' },
  { id: 'dromedary', name: 'อูฐ', rate: 0.86, diet: 'herb' },
  { id: 'thrumbo', name: 'Thrumbo', rate: 2.8, diet: 'herb' },
  { id: 'warg', name: 'Warg', rate: 0.4, diet: 'strict' }
];

var DIET_LABEL = { herb: 'กินพืช', omni: 'กินทั้งคู่', carn: 'กินเนื้อ', strict: 'warg' };

// สูตร: 20 เนื้อ + 20 ผัก ต่อรอบ — Butcher table ได้ 50 ชิ้น (125%) · Butcher spot ได้ 35 (87.5%)
var STATIONS = {
  table: { id: 'table', name: 'Butcher table', outNut: 2.5, batch: 50 },
  spot: { id: 'spot', name: 'Butcher spot', outNut: 1.75, batch: 35 }
};

var KIBBLE_NUT = 0.05;
var BATCH_IN = 20;
var MAX_PER_ANIMAL = 50;
var DEFAULT_BUFFER = 0.2;
var QUADRUM_DAYS = 15;
var RICE_REAL_DAYS_SOIL = 5.54;
var RICE_YIELD = 6;

var DEFAULT_COUNTS = {
  chicken: 6, cat: 1, alpaca: 0, pig: 2, husky: 2, horse: 0,
  cow: 1, muffalo: 0, dromedary: 0, thrumbo: 0, warg: 1
};

function clampInt(n, lo, hi) {
  var x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(x)));
}

function clampBuffer(n) {
  var x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_BUFFER;
  return Math.max(0, Math.min(0.5, x));
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
  var station = STATIONS[parseStation(src.station)];
  var buffer = clampBuffer(src.buffer);

  var nutrition = 0;
  var wargNutrition = 0;
  var wargCount = 0;
  var total = 0;
  ANIMALS.forEach(function (a) {
    var n = counts[a.id] || 0;
    total += n;
    if (a.diet === 'strict') {
      wargNutrition += a.rate * n;
      wargCount += n;
    } else {
      nutrition += a.rate * n;
    }
  });

  var need = nutrition * (1 + buffer);
  var pieces = need / KIBBLE_NUT;
  var ingExact = need / station.outNut * BATCH_IN;
  var wargNeed = wargNutrition * (1 + buffer);

  return {
    counts: counts,
    station: station.id,
    buffer: buffer,
    animalTotal: total,
    wargCount: wargCount,
    nutrition: nutrition,
    wargNutrition: wargNutrition,
    pieces: pieces,
    piecesDay: ceilCount(pieces),
    batches: pieces / station.batch,
    billsDay: ceilCount(pieces / station.batch),
    meatUnits: ceilCount(ingExact),
    vegUnits: ceilCount(ingExact),
    ricePlants: ceilCount(ingExact * RICE_REAL_DAYS_SOIL / RICE_YIELD),
    wargMeatUnits: ceilCount(wargNeed / KIBBLE_NUT),
    quadrumPieces: ceilCount(pieces * QUADRUM_DAYS),
    quadrumMeat: ceilCount(ingExact * QUADRUM_DAYS),
    quadrumVeg: ceilCount(ingExact * QUADRUM_DAYS)
  };
}

// raw = ส่วนของ state ที่เกี่ยวกับแท็บสัตว์ (จาก localStorage / URL / เซิร์ฟเวอร์)
// รับ an = 'chicken:6,husky:2' · kb = 'table'|'spot' · kbuf = เปอร์เซ็นต์ 0–50
// ไม่มีค่าเลย → ตัวอย่างเริ่มต้น · มี an แต่ว่าง → ล้างศูนย์ทั้งหมด
function parseKibbleState(raw) {
  var src = raw || {};
  var hasCounts = src.an != null || src.counts != null;
  return {
    counts: parseCounts(hasCounts ? (src.an != null ? src.an : src.counts) : DEFAULT_COUNTS),
    station: parseStation(src.kb != null ? src.kb : src.station),
    buffer: src.kbuf != null ? clampBuffer(Number(src.kbuf) / 100)
      : clampBuffer(src.buffer)
  };
}

function defaultKibbleState() {
  return {
    counts: parseCounts(DEFAULT_COUNTS),
    station: 'table',
    buffer: DEFAULT_BUFFER
  };
}

var api = {
  ANIMALS: ANIMALS,
  DIET_LABEL: DIET_LABEL,
  STATIONS: STATIONS,
  KIBBLE_NUT: KIBBLE_NUT,
  QUADRUM_DAYS: QUADRUM_DAYS,
  DEFAULT_COUNTS: DEFAULT_COUNTS,
  clampInt: clampInt,
  clampBuffer: clampBuffer,
  animalById: animalById,
  parseCounts: parseCounts,
  parseStation: parseStation,
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
