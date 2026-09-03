'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const calc = require('./calc.js');

test('5 adults rice simple 0% buffer → 8 basins', () => {
  const r = calc.planMeal({
    adults: 5, kids: 0, babies: 0, meal: 'simple', crop: 'rice', buffer: 0
  });
  assert.equal(r.basins, 8);
  assert.ok(Math.abs(r.exact - 7.333) < 0.01);
});

test('5 adults rice simple 20% → 9 basins', () => {
  const r = calc.planMeal({
    adults: 5, kids: 0, babies: 0, meal: 'simple', crop: 'rice', buffer: 0.2
  });
  assert.equal(r.basins, 9);
  assert.equal(r.growTiles, 36);
  assert.equal(r.lamps, 1);
});

test('1 adult rice raw-equivalent via 0 buffer simple is not 3; raw not offered', () => {
  const r = calc.planMeal({
    adults: 1, kids: 0, babies: 0, meal: 'simple', crop: 'rice', buffer: 0
  });
  assert.equal(r.basins, 2);
});

test('0 crew → 0 basins and 0 room tiles', () => {
  const r = calc.planMeal({
    adults: 0, kids: 0, babies: 0, meal: 'simple', crop: 'rice', buffer: 0.2
  });
  assert.equal(r.basins, 0);
  assert.equal(r.growTiles, 0);
  assert.equal(r.roomTiles, 0);
});

test('growthFactor scales basins up for cold rooms and clamps junk', () => {
  const base = calc.planMeal({ adults: 5, meal: 'simple', crop: 'rice', buffer: 0 });
  const cold = calc.planMeal({ adults: 5, meal: 'simple', crop: 'rice', buffer: 0, growthFactor: 0.58 });
  assert.equal(cold.basins, Math.ceil(base.exact / 0.58));
  const junky = calc.planMeal({ adults: 5, meal: 'simple', crop: 'rice', buffer: 0, growthFactor: 'x' });
  assert.equal(junky.basins, base.basins);
  const over = calc.planMeal({ adults: 5, meal: 'simple', crop: 'rice', buffer: 0, growthFactor: 9 });
  assert.equal(over.basins, base.basins);
});

test('compareMeals passes growthFactor through to meals and corn tiles', () => {
  const warm = calc.compareMeals({ adults: 5, crop: 'rice', buffer: 0 });
  const cold = calc.compareMeals({ adults: 5, crop: 'rice', buffer: 0, growthFactor: 0.5 });
  assert.ok(cold.meals[0].basins >= warm.meals[0].basins);
  const cornPerTile = 1.05 * calc.UNIT;
  assert.equal(cold.corn.soilTiles, Math.ceil(warm.corn.vegRaw / (cornPerTile * 0.5)));
});

test('clamps each age group at 50 and crew at 80', () => {
  const crew = calc.parseCrew({ adults: 99, kids: 99, babies: 99 });
  assert.equal(crew.adults, 50);
  assert.equal(crew.kids, 30);
  assert.equal(crew.babies, 0);
  assert.equal(crew.adults + crew.kids + crew.babies, 80);
});

test('rejects NaN and strings as zero-or-clamped ints', () => {
  const crew = calc.parseCrew({ adults: '4', kids: 'nope', babies: null });
  assert.equal(crew.adults, 4);
  assert.equal(crew.kids, 0);
  assert.equal(crew.babies, 0);
});

test('25 basins need 2 sun lamps', () => {
  assert.equal(calc.lampsFor(25), 2);
  assert.equal(calc.lampsFor(24), 1);
  assert.equal(calc.lampsFor(0), 0);
});

test('4 adults + 2 kids rice simple 20% → 10 basins, 40 grow tiles', () => {
  const r = calc.planMeal({
    adults: 4, kids: 2, babies: 0, meal: 'simple', crop: 'rice', buffer: 0.2
  });
  assert.ok(Math.abs(r.nutrition - 8.96) < 1e-9);
  assert.equal(r.basins, 10);
  assert.equal(r.growTiles, 40);
  assert.equal(r.meatRaw, 0);
  assert.equal(r.completeFromHydro, true);
});

test('same crew pemmican 20% → 6 veg basins and needs meat', () => {
  const r = calc.planMeal({
    adults: 4, kids: 2, babies: 0, meal: 'pemmican', crop: 'rice', buffer: 0.2
  });
  assert.equal(r.basins, 6);
  assert.ok(r.meatRaw > 0);
  assert.equal(r.completeFromHydro, false);
});

test('same crew survival 20% → 6 veg basins and needs meat', () => {
  const r = calc.planMeal({
    adults: 4, kids: 2, babies: 0, meal: 'survival', crop: 'rice', buffer: 0.2
  });
  assert.equal(r.basins, 6);
  assert.ok(r.meatRaw > 0);
  assert.equal(r.completeFromHydro, false);
});

test('one baby adds 0.1 veg/day and does not follow meal recipe', () => {
  const none = calc.planMeal({
    adults: 0, kids: 0, babies: 1, meal: 'survival', crop: 'rice', buffer: 0
  });
  assert.ok(Math.abs(none.vegRaw - 0.1) < 1e-9);
  assert.equal(none.meatRaw, 0);
});

test('corn landing mode returns soil tiles and never basins', () => {
  const r = calc.cornSoil({
    adults: 4, kids: 2, babies: 0, meal: 'simple', buffer: 0.2
  });
  assert.equal(r.soilTiles, 114);
  assert.equal(r.basins, null);
});

test('room pack for 10 basins is 5×9 = 45 interior tiles', () => {
  const room = calc.roomPack(10);
  assert.equal(room.width, 5);
  assert.equal(room.depth, 9);
  assert.equal(room.tiles, 45);
  assert.equal(room.lamps, 1);
});

test('compareMeals recommends simple for ship-only veg', () => {
  const c = calc.compareMeals({
    adults: 4, kids: 2, babies: 0, crop: 'rice', buffer: 0.2
  });
  assert.equal(c.recommend, 'simple');
  assert.ok(!c.meals.some((m) => m.id === 'paste'));
  assert.deepEqual(c.meals.map((m) => m.id), ['simple', 'pemmican', 'survival']);
  const simple = c.meals.find((m) => m.id === 'simple');
  const pem = c.meals.find((m) => m.id === 'pemmican');
  assert.ok(pem.basins < simple.basins);
  assert.equal(simple.completeFromHydro, true);
  assert.equal(pem.completeFromHydro, false);
});

test('unknown meal or crop falls back safely', () => {
  const r = calc.planMeal({
    adults: 1, meal: 'paste', crop: 'corn', buffer: 9
  });
  assert.equal(r.meal, 'simple');
  assert.equal(r.crop, 'rice');
  assert.equal(r.buffer, 0.5);
});

test('query parser only accepts integers', () => {
  const crew = calc.parseQuery('?a=4&k=2&b=<script>1</script>');
  assert.equal(crew.adults, 4);
  assert.equal(crew.kids, 2);
  assert.equal(crew.babies, 0);
});
