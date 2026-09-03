'use strict';

var BATTERY_WD = 600;
var LOSS_PER_DAY = 5;
var MAX_WATTS = 50000;
var MAX_BATTERIES = 80;
var DEFAULT_HOURS = 15;
var STATE_SCHEMA = 3;
var OLD_NIGHT_HOURS = 11;

function parseWatts(raw) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(MAX_WATTS, Math.trunc(raw)));
  }
  var digits = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
  if (!digits) return 0;
  var n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_WATTS, n));
}

function parseHours(raw) {
  var n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return DEFAULT_HOURS;
  return Math.max(1, Math.min(18, Math.trunc(n)));
}

function batteriesNeeded(watts, hours) {
  var w = parseWatts(watts);
  var h = parseHours(hours);
  var base = w * h / 24;
  if (base <= 1e-12) {
    return { batteries: 0, needWd: 0, storedWd: 0, spareWd: 0, watts: w, hours: h };
  }
  var n = 1;
  var need = base;
  while (n <= MAX_BATTERIES) {
    need = base + LOSS_PER_DAY * n * (h / 24);
    if (n * BATTERY_WD >= need) break;
    n++;
  }
  var stored = n * BATTERY_WD;
  return {
    batteries: n,
    needWd: need,
    storedWd: stored,
    spareWd: Math.max(0, stored - need),
    watts: w,
    hours: h
  };
}

function flareReserve() {
  return { batteries: null, reason: 'solar flare cuts the whole grid' };
}

function parseAppState(raw) {
  var src = raw && typeof raw === 'object' ? raw : {};
  var pick = src.pick;
  if (pick !== 'simple' && pick !== 'pemmican' && pick !== 'survival') pick = 'simple';
  var tab = (src.tab === 'power' || src.tab === 'grow' || src.tab === 'drug' ||
    src.tab === 'leather' || src.tab === 'settings')
    ? src.tab
    : 'food';
  var buffer = Number(src.buffer);
  if (!Number.isFinite(buffer)) buffer = 0.2;
  buffer = Math.max(0, Math.min(0.5, buffer));
  var schema = Number(src.schema);
  if (!Number.isFinite(schema)) schema = 0;
  var hoursIn = src.hours;
  var hours;
  if (hoursIn == null) {
    hours = DEFAULT_HOURS;
  } else if (schema < STATE_SCHEMA && Number(hoursIn) === OLD_NIGHT_HOURS) {
    hours = DEFAULT_HOURS;
  } else {
    hours = parseHours(hoursIn);
  }
  return {
    tab: tab,
    adults: src.adults,
    kids: src.kids,
    babies: src.babies,
    buffer: buffer,
    pick: pick,
    schema: STATE_SCHEMA,
    watts: (src.watts == null || (typeof src.watts === 'string' && !/\d/.test(src.watts)))
      ? 1000
      : parseWatts(src.watts),
    hours: hours
  };
}

function defaultAppState() {
  return parseAppState({
    tab: 'food',
    adults: 4,
    kids: 2,
    babies: 0,
    buffer: 0.2,
    pick: 'simple',
    watts: 1000,
    hours: DEFAULT_HOURS,
    schema: STATE_SCHEMA
  });
}

var api = {
  BATTERY_WD: BATTERY_WD,
  DEFAULT_HOURS: DEFAULT_HOURS,
  STATE_SCHEMA: STATE_SCHEMA,
  MAX_WATTS: MAX_WATTS,
  parseWatts: parseWatts,
  parseHours: parseHours,
  batteriesNeeded: batteriesNeeded,
  flareReserve: flareReserve,
  parseAppState: parseAppState,
  defaultAppState: defaultAppState
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.PowerCalc = api;
}
