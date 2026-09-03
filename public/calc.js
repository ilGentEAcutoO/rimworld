'use strict';

var UNIT = 0.05;
var YIELD = {
  rice: 12.12 * UNIT,
  berry: 10.56 * UNIT,
  potato: 7.08 * UNIT
};
var CORN_PER_TILE = 1.05 * UNIT;
var MAX_GROUP = 50;
var MAX_CREW = 80;
var BASINS_PER_LAMP = 24;
var BASIN_TILES = 4;
var BASIN_WATT = 70;
var LAMP_WATT = 2900;

var MEALS = {
  simple: { id: 'simple', vegIn: 0.5, meatIn: 0, out: 0.9, name: 'Simple meal' },
  pemmican: { id: 'pemmican', vegIn: 0.25, meatIn: 0.25, out: 0.8, name: 'Pemmican' },
  survival: { id: 'survival', vegIn: 0.3, meatIn: 0.3, out: 0.9, name: 'Survival pack' }
};

function clampInt(n, lo, hi) {
  var x = typeof n === 'string' && n.trim() !== '' ? Number(n) : Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(x)));
}

function clampBuffer(n) {
  var x = Number(n);
  if (!Number.isFinite(x)) return 0.2;
  return Math.max(0, Math.min(0.5, x));
}

function clampFactor(x) {
  var n = Number(x);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.05, Math.min(1, n));
}

function parseCrew(input) {
  var src = input || {};
  var adults = clampInt(src.adults, 0, MAX_GROUP);
  var kids = clampInt(src.kids, 0, MAX_GROUP);
  var babies = clampInt(src.babies, 0, MAX_GROUP);
  var overflow = adults + kids + babies - MAX_CREW;
  if (overflow > 0) {
    var cut = Math.min(babies, overflow);
    babies -= cut;
    overflow -= cut;
    cut = Math.min(kids, overflow);
    kids -= cut;
    overflow -= cut;
    adults = Math.max(0, adults - overflow);
  }
  return { adults: adults, kids: kids, babies: babies };
}

function parseQuery(search) {
  var raw = String(search || '');
  if (raw.charAt(0) === '?') raw = raw.slice(1);
  var map = {};
  if (raw) {
    raw.split('&').forEach(function (part) {
      var i = part.indexOf('=');
      var k = i < 0 ? part : part.slice(0, i);
      var v = i < 0 ? '' : part.slice(i + 1);
      try {
        k = decodeURIComponent(k);
        v = decodeURIComponent(v);
      } catch (e) {
        return;
      }
      if (k === 'a' || k === 'adults') map.adults = v;
      if (k === 'k' || k === 'kids') map.kids = v;
      if (k === 'b' || k === 'babies') map.babies = v;
    });
  }
  return parseCrew(map);
}

function nutritionOf(crew) {
  return crew.adults * 1.6 + crew.kids * 1.28 + crew.babies * 0.2;
}

function eatersNutrition(crew) {
  return crew.adults * 1.6 + crew.kids * 1.28;
}

function babyVeg(crew) {
  return crew.babies * 0.1;
}

function ceilCount(x) {
  if (x <= 1e-12) return 0;
  return Math.ceil(x - 1e-9);
}

function resolveMeal(id) {
  return MEALS[id] || MEALS.simple;
}

function resolveCrop(id) {
  return YIELD[id] ? id : 'rice';
}

function lampsFor(basins) {
  if (basins <= 0) return 0;
  return Math.ceil(basins / BASINS_PER_LAMP);
}

function packOneRoom(n) {
  if (n <= 0) return { width: 0, depth: 0, tiles: 0 };
  if (n === 1) return { width: 2, depth: 4, tiles: 8 };
  return { width: Math.ceil(n / 2), depth: 9, tiles: Math.ceil(n / 2) * 9 };
}

function roomPack(basins) {
  if (basins <= 0) return { tiles: 0, width: 0, depth: 0, lamps: 0, rooms: 0 };
  var lamps = lampsFor(basins);
  var full = Math.floor(basins / BASINS_PER_LAMP);
  var rem = basins % BASINS_PER_LAMP;
  var fullPack = packOneRoom(24);
  var remPack = packOneRoom(rem);
  var tiles = full * fullPack.tiles + remPack.tiles;
  var width = rem ? remPack.width : fullPack.width;
  var depth = rem ? remPack.depth : fullPack.depth;
  if (full && rem) {
    width = null;
    depth = null;
  }
  return {
    tiles: tiles,
    width: width,
    depth: depth,
    lamps: lamps,
    rooms: lamps
  };
}

function vegAndMeat(crew, meal) {
  var eat = eatersNutrition(crew);
  var veg = babyVeg(crew);
  var meat = 0;
  if (eat > 0) {
    veg += eat / meal.out * meal.vegIn;
    meat += eat / meal.out * meal.meatIn;
  }
  return { vegRaw: veg, meatRaw: meat };
}

function planMeal(input) {
  var src = input || {};
  var crew = parseCrew(src);
  var meal = resolveMeal(src.meal);
  var crop = resolveCrop(src.crop);
  var buffer = clampBuffer(src.buffer);
  var growth = clampFactor(src.growthFactor);
  var raw = vegAndMeat(crew, meal);
  var exact = raw.vegRaw <= 0 ? 0 : raw.vegRaw / (YIELD[crop] * growth) * (1 + buffer);
  var basins = ceilCount(exact);
  var lamps = lampsFor(basins);
  var room = roomPack(basins);
  return {
    crew: crew,
    id: meal.id,
    meal: meal.id,
    crop: crop,
    buffer: buffer,
    nutrition: nutritionOf(crew),
    vegRaw: raw.vegRaw,
    meatRaw: raw.meatRaw,
    exact: exact,
    basins: basins,
    growTiles: basins * BASIN_TILES,
    roomTiles: room.tiles,
    roomWidth: room.width,
    roomDepth: room.depth,
    lamps: lamps,
    wattsDay: basins * BASIN_WATT + lamps * LAMP_WATT,
    completeFromHydro: raw.meatRaw <= 1e-12
  };
}

function cornSoil(input) {
  var src = input || {};
  var crew = parseCrew(src);
  var meal = resolveMeal(src.meal);
  var buffer = clampBuffer(src.buffer);
  var growth = clampFactor(src.growthFactor);
  var raw = vegAndMeat(crew, meal);
  var exact = raw.vegRaw <= 0 ? 0 : raw.vegRaw / (CORN_PER_TILE * growth) * (1 + buffer);
  return {
    soilTiles: ceilCount(exact),
    basins: null,
    vegRaw: raw.vegRaw,
    meal: meal.id
  };
}

function compareMeals(input) {
  var src = input || {};
  var ids = ['simple', 'pemmican', 'survival'];
  var meals = ids.map(function (id) {
    return planMeal({
      adults: src.adults,
      kids: src.kids,
      babies: src.babies,
      meal: id,
      crop: src.crop,
      buffer: src.buffer,
      growthFactor: src.growthFactor
    });
  });
  return {
    crew: parseCrew(src),
    nutrition: nutritionOf(parseCrew(src)),
    meals: meals,
    recommend: 'simple',
    reason: 'ปลูกผักบนเรืออย่างเดียวแล้วครบ',
    corn: cornSoil({
      adults: src.adults,
      kids: src.kids,
      babies: src.babies,
      meal: 'simple',
      buffer: src.buffer,
      growthFactor: src.growthFactor
    })
  };
}

var api = {
  UNIT: UNIT,
  YIELD: YIELD,
  MEALS: MEALS,
  MAX_GROUP: MAX_GROUP,
  MAX_CREW: MAX_CREW,
  clampInt: clampInt,
  clampBuffer: clampBuffer,
  clampFactor: clampFactor,
  parseCrew: parseCrew,
  parseQuery: parseQuery,
  lampsFor: lampsFor,
  roomPack: roomPack,
  planMeal: planMeal,
  cornSoil: cornSoil,
  compareMeals: compareMeals
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.LifeSupport = api;
}
