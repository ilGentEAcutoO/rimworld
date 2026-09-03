'use strict';

var REST = 24 / 13;
var DEFAULT_LEAVE = 14;
var DEFAULT_PACK = 3;
var MIN_LEAVE = 2;
var MAX_LEAVE = 30;
var MIN_PACK = 0;
var MAX_PACK = 5;
var GROW_MIN_C = 0;
var IDEAL_MIN_C = 6;
var IDEAL_MAX_C = 42;
var GROW_MAX_C = 58;
var DEFAULT_HEAT = IDEAL_MIN_C + 1;
var DEFAULT_COOL = IDEAL_MAX_C - 1;

var SOILS = {
  hydro: { id: 'hydro', fert: 2.8, name: 'Hydro 280%' },
  rich: { id: 'rich', fert: 1.4, name: 'Rich soil' },
  soil: { id: 'soil', fert: 1.0, name: 'Soil' },
  gravel: { id: 'gravel', fert: 0.7, name: 'Stony soil' }
};

var CROPS = [
  { id: 'rice', name: 'Rice', grow: 3, sens: 1, hydro: true, kind: 'food' },
  { id: 'strawberry', name: 'Strawberry', grow: 4.6, sens: 1, hydro: true, kind: 'food' },
  { id: 'potato', name: 'Potato', grow: 5.8, sens: 0.4, hydro: true, kind: 'food' },
  { id: 'toxipotato', name: 'Toxipotato', grow: 4.9, sens: 0, hydro: true, kind: 'food' },
  { id: 'corn', name: 'Corn', grow: 11.3, sens: 1, hydro: false, kind: 'food' },
  { id: 'haygrass', name: 'Hay', grow: 7, sens: 0.6, hydro: false, kind: 'food' },
  { id: 'nutrifungus', name: 'Nutrifungus', grow: 6, sens: 0.15, hydro: true, kind: 'food', dark: true },
  { id: 'cotton', name: 'Cotton', grow: 8, sens: 1, hydro: true, kind: 'textile' },
  { id: 'devilstrand', name: 'Devilstrand', grow: 22.5, sens: 1, hydro: false, kind: 'textile' },
  { id: 'fibercorn', name: 'Fibercorn', grow: 6, sens: 0.1, hydro: true, kind: 'textile' },
  { id: 'tinctoria', name: 'Tinctoria', grow: 2, sens: 1, hydro: true, kind: 'textile' },
  { id: 'healroot', name: 'Healroot', grow: 7, sens: 1, hydro: true, kind: 'drug' },
  { id: 'hops', name: 'Hops', grow: 5, sens: 0.7, hydro: true, kind: 'drug' },
  { id: 'smokeleaf', name: 'Smokeleaf', grow: 7.5, sens: 1, hydro: true, kind: 'drug' },
  { id: 'psychoid', name: 'Psychoid', grow: 9, sens: 0.4, hydro: true, kind: 'drug' }
];

var KINDS = ['food', 'textile', 'drug'];
var KIND_LABEL = { food: 'Food', textile: 'Textile', drug: 'Drug' };
var KIND_ORDER = { food: 0, textile: 1, drug: 2 };
var SORTS = ['days', 'az'];

function allCropIds() {
  return CROPS.map(function (c) { return c.id; });
}

function parseShown(raw) {
  var ids = [];
  if (raw == null) return allCropIds();
  if (Array.isArray(raw)) ids = raw;
  else ids = String(raw).split(/[,\s]+/);
  var seen = {};
  var out = [];
  ids.forEach(function (id) {
    var crop = null;
    var i;
    for (i = 0; i < CROPS.length; i++) {
      if (CROPS[i].id === id || (id === 'hay' && CROPS[i].id === 'haygrass')) {
        crop = CROPS[i];
        break;
      }
    }
    if (crop && !seen[crop.id]) {
      seen[crop.id] = true;
      out.push(crop.id);
    }
  });
  return out;
}

function cropById(id) {
  var i;
  if (id === 'hay') id = 'haygrass';
  for (i = 0; i < CROPS.length; i++) {
    if (CROPS[i].id === id) return CROPS[i];
  }
  return CROPS[0];
}

function resolveSoil(id) {
  return SOILS[id] || SOILS.hydro;
}

function parseLeave(raw) {
  if (raw == null || raw === '' || raw === 'open' || raw === 'none') return null;
  var n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(MIN_LEAVE, Math.min(MAX_LEAVE, Math.trunc(n)));
}

function parsePack(raw) {
  var n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return DEFAULT_PACK;
  return Math.max(MIN_PACK, Math.min(MAX_PACK, Math.trunc(n)));
}

function parseDays(raw) {
  var n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(60, Math.trunc(n)));
}

function parsePercent(raw) {
  var n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function parseTemp(raw, fallback) {
  var n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-20, Math.min(80, Math.round(n)));
}

function grfAtTemp(t) {
  if (t < GROW_MIN_C || t > GROW_MAX_C) return 0;
  if (t < IDEAL_MIN_C) return t / IDEAL_MIN_C;
  if (t <= IDEAL_MAX_C) return 1;
  return (GROW_MAX_C - t) / (GROW_MAX_C - IDEAL_MAX_C);
}

function segArea(lo, hi, a, b, kind) {
  var s = Math.max(lo, a);
  var e = Math.min(hi, b);
  if (e <= s) return 0;
  if (kind === 'up') return (e * e - s * s) / (2 * IDEAL_MIN_C);
  if (kind === 'flat') return e - s;
  function F(x) { return (GROW_MAX_C * x - x * x / 2) / (GROW_MAX_C - IDEAL_MAX_C); }
  return F(e) - F(s);
}

function tempFactor(minC, maxC) {
  var lo = parseTemp(minC, DEFAULT_HEAT);
  var hi = parseTemp(maxC, DEFAULT_COOL);
  if (hi < lo) {
    var sw = lo;
    lo = hi;
    hi = sw;
  }
  var span = hi - lo;
  if (span <= 1e-9) return grfAtTemp(lo);
  var area =
    segArea(lo, hi, GROW_MIN_C, IDEAL_MIN_C, 'up') +
    segArea(lo, hi, IDEAL_MIN_C, IDEAL_MAX_C, 'flat') +
    segArea(lo, hi, IDEAL_MAX_C, GROW_MAX_C, 'down');
  return area / span;
}

function fertilityFactor(fert, sens) {
  return 1 + (fert - 1) * sens;
}

function growWindow(leave, pack) {
  var leaveDays = parseLeave(leave);
  var packDays = parsePack(pack);
  if (leaveDays == null) {
    return { leave: null, pack: packDays, deadline: null, open: true };
  }
  return {
    leave: leaveDays,
    pack: packDays,
    deadline: Math.max(0, leaveDays - packDays),
    open: false
  };
}

function realDays(crop, soilId) {
  var c = typeof crop === 'string' ? cropById(crop) : crop;
  if (!c) return null;
  var soil = resolveSoil(soilId);
  if (soil.id === 'hydro' && !c.hydro) return null;
  return c.grow * REST / fertilityFactor(soil.fert, c.sens);
}

function verdict(crop, soilId, leave, pack) {
  var win = growWindow(leave, pack);
  var real = realDays(crop, soilId);
  if (real == null) {
    return { ok: false, tag: 'no', label: 'no hydro', real: null, deadline: win.deadline, leave: win.leave, pack: win.pack, open: win.open };
  }
  if (win.open) {
    return { ok: true, tag: 'plan', label: 'grow', real: real, deadline: null, leave: null, pack: win.pack, open: true };
  }
  if (win.deadline <= 0 || real > win.deadline + 1e-9) {
    return { ok: false, tag: 'no', label: 'skip', real: real, deadline: win.deadline, leave: win.leave, pack: win.pack, open: false };
  }
  return { ok: true, tag: 'go', label: 'harvest', real: real, deadline: win.deadline, leave: win.leave, pack: win.pack, open: false };
}

function planCrops(input) {
  var src = input || {};
  var soil = resolveSoil(src.soil).id;
  var kind = KINDS.indexOf(src.kind) >= 0 ? src.kind : 'all';
  var sort = SORTS.indexOf(src.sort) >= 0 ? src.sort : 'days';
  var win = growWindow(src.leave, src.pack);
  var shown = parseShown(src.shown);
  var shownSet = {};
  shown.forEach(function (id) { shownSet[id] = true; });
  var rows = CROPS.filter(function (c) {
    return shownSet[c.id];
  }).map(function (c) {
    var v = verdict(c, soil, win.leave, win.pack);
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      listed: c.grow,
      hydro: c.hydro,
      dark: !!c.dark,
      real: v.real,
      tag: v.tag,
      label: v.label,
      ok: v.ok
    };
  });
  rows.sort(function (a, b) {
    var ka = KIND_ORDER[a.kind];
    var kb = KIND_ORDER[b.kind];
    if (ka !== kb) return ka - kb;
    if (sort === 'az') return a.name.localeCompare(b.name);
    if (a.real == null && b.real != null) return 1;
    if (b.real == null && a.real != null) return -1;
    if (!win.open && a.ok !== b.ok) return a.ok ? -1 : 1;
    var ar = a.real == null ? -1 : a.real;
    var br = b.real == null ? -1 : b.real;
    if (br !== ar) return br - ar;
    return a.name.localeCompare(b.name);
  });
  return {
    soil: soil,
    kind: kind,
    sort: sort,
    shown: shown,
    open: win.open,
    leave: win.leave,
    pack: win.pack,
    deadline: win.deadline,
    rows: rows
  };
}

function parseGrowState(raw) {
  var src = raw && typeof raw === 'object' ? raw : {};
  var soil = SOILS[src.soil] ? src.soil : 'soil';
  var kind = src.kind === 'all' || KINDS.indexOf(src.kind) >= 0 ? src.kind : 'all';
  return {
    leave: (function () {
      if (src.leaveSet === false || src.leave === 'open') return null;
      if (src.leaveSet === true) return parseLeave(src.leave == null ? DEFAULT_LEAVE : src.leave);
      if (src.leave == null || src.leave === '') return null;
      return parseLeave(src.leave);
    }()),
    pack: src.pack == null ? DEFAULT_PACK : parsePack(src.pack),
    soil: soil,
    kind: kind,
    sort: SORTS.indexOf(src.sort) >= 0 ? src.sort : 'days',
    shown: parseShown(src.shown),
    diagCrop: cropById(src.diagCrop || 'potato').id,
    diagDays: parseDays(src.diagDays == null ? 14 : src.diagDays),
    diagPercent: parsePercent(src.diagPercent == null ? 76 : src.diagPercent),
    heat: parseTemp(src.heat, DEFAULT_HEAT),
    cool: parseTemp(src.cool, DEFAULT_COOL)
  };
}

function defaultGrowState() {
  return parseGrowState({});
}

function diagnose(input) {
  var src = input || {};
  var crop = cropById(src.crop);
  var soil = resolveSoil(src.soil);
  var days = parseDays(src.days);
  var percent = parsePercent(src.percent);
  var heat = parseTemp(src.heat, DEFAULT_HEAT);
  var cool = parseTemp(src.cool, DEFAULT_COOL);
  var tempGrf = tempFactor(heat, cool);
  var real = realDays(crop, soil.id);
  var expected = real == null || real <= 0 ? null : Math.min(100, 100 * days * tempGrf / real);
  var grownDays = (percent / 100) * crop.grow;
  var lightDays = days * (13 / 24);
  var impliedGrf = lightDays <= 1e-12 ? 0 : grownDays / lightDays;
  var soilGrf = soil.id === 'hydro' && !crop.hydro ? null : fertilityFactor(soil.fert, crop.sens);
  return {
    crop: crop.id,
    name: crop.name,
    soil: soil.id,
    days: days,
    percent: percent,
    heat: heat,
    cool: cool,
    tempGrf: tempGrf,
    real: real,
    expected: expected,
    impliedGrf: impliedGrf,
    soilGrf: soilGrf
  };
}

var api = {
  REST: REST,
  DEFAULT_LEAVE: DEFAULT_LEAVE,
  DEFAULT_PACK: DEFAULT_PACK,
  GROW_MIN_C: GROW_MIN_C,
  IDEAL_MIN_C: IDEAL_MIN_C,
  IDEAL_MAX_C: IDEAL_MAX_C,
  GROW_MAX_C: GROW_MAX_C,
  DEFAULT_HEAT: DEFAULT_HEAT,
  DEFAULT_COOL: DEFAULT_COOL,
  SOILS: SOILS,
  CROPS: CROPS,
  allCropIds: allCropIds,
  parseShown: parseShown,
  KINDS: KINDS,
  KIND_LABEL: KIND_LABEL,
  SORTS: SORTS,
  cropById: cropById,
  parseGrowState: parseGrowState,
  defaultGrowState: defaultGrowState,
  parseLeave: parseLeave,
  parsePack: parsePack,
  parseDays: parseDays,
  parsePercent: parsePercent,
  parseTemp: parseTemp,
  grfAtTemp: grfAtTemp,
  tempFactor: tempFactor,
  fertilityFactor: fertilityFactor,
  growWindow: growWindow,
  realDays: realDays,
  verdict: verdict,
  planCrops: planCrops,
  diagnose: diagnose
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.GrowTime = api;
}
