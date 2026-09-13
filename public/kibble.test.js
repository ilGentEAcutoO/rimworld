'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const kc = require('./kibble.js');

test('roster integrity: 95 species, unique ids, sane rates and enums', () => {
  assert.equal(kc.ANIMALS.length, 95);
  const ids = new Set(kc.ANIMALS.map((a) => a.id));
  assert.equal(ids.size, 95);
  const diets = new Set(['herb', 'omni', 'carn', 'strict']);
  const tags = new Set(['', 'OD', 'B']);
  const prods = new Set(['', 'Eggs', 'Milk', 'Wool', 'Chemfuel']);
  kc.ANIMALS.forEach((a) => {
    assert.ok(a.rate > 0 && a.rate <= 5, a.id + ' rate out of range');
    assert.ok(diets.has(a.diet), a.id + ' bad diet');
    assert.ok(tags.has(a.tag), a.id + ' bad tag');
    assert.ok(prods.has(a.prod), a.id + ' bad prod');
  });
});

test('hunger rates sum: 6 chickens + 1 cat + 2 pigs + 2 huskies + 1 cow = 5.62/day', () => {
  const r = kc.planKibble({
    counts: { chicken: 6, cat: 1, pig: 2, husky: 2, cow: 1 },
    station: 'table', buffer: 0
  });
  assert.ok(Math.abs(r.nutrition - 5.62) < 1e-9);
  assert.ok(Math.abs(r.pieces - 112.4) < 1e-6);
});

test('strict-carnivores are excluded from kibble and counted as raw meat', () => {
  const r = kc.planKibble({
    counts: { warg: 1, husky: 1 },
    station: 'table', buffer: 0
  });
  assert.ok(Math.abs(r.nutrition - 0.8) < 1e-9);
  assert.equal(r.strictCount, 1);
  assert.deepEqual(r.strictNames, ['Warg']);
  assert.ok(Math.abs(r.strictNutrition - 0.4) < 1e-9);
  assert.equal(r.strictMeatUnits, 8);
  assert.equal(r.piecesDay, 16);
});

test('strict group covers warg + wolverine + vulture (Odyssey)', () => {
  const r = kc.planKibble({
    counts: { warg: 1, wolverine: 2, vulture: 1, husky: 1 },
    shown: ['warg', 'wolverine', 'vulture', 'husky'],
    station: 'table', buffer: 0
  });
  assert.equal(r.strictCount, 4);
  assert.deepEqual(r.strictNames, ['Warg', 'Wolverine', 'Vulture']);
  // 0.4 + 2*0.37 + 0.37 = 1.51 nut → 30.2 → 31 pieces of raw meat
  assert.equal(r.strictMeatUnits, 31);
});

test('butcher table: 20+20 → 50 pieces at 125%; spot: 35 at 87.5%', () => {
  const table = kc.planKibble({ counts: { husky: 2 }, station: 'table', buffer: 0 });
  const spot = kc.planKibble({ counts: { husky: 2 }, station: 'spot', buffer: 0 });
  // 1.6 nut/day → 32 pieces → table needs 1.6/2.5*20 = 12.8 → 13 units of each side
  assert.equal(table.meatUnits, 13);
  assert.equal(table.vegUnits, 13);
  assert.equal(table.billsDay, 1);
  // spot: 1.6/1.75*20 = 18.29 → 19 units, and 32/35 → 1 bill still covers it
  assert.equal(spot.meatUnits, 19);
  assert.equal(spot.billsDay, 1);
  assert.ok(spot.meatUnits > table.meatUnits);
});

test('no buffer anywhere: results are pure hunger rates, old buffer input ignored', () => {
  const base = kc.planKibble({ counts: { cow: 1 }, station: 'table', cycleDays: 3 });
  const withLegacyBuf = kc.planKibble({ counts: { cow: 1 }, station: 'table', cycleDays: 3, buffer: 0.5, kbuf: 200 });
  assert.equal(base.cyclePieces, withLegacyBuf.cyclePieces);
  assert.equal(base.piecesDay, 18); // 0.86/0.05 = 17.2, no margin
});

test('sample pen on a 3-day cycle: 338 pieces, 7 bills at table, 135 meat/veg', () => {
  const counts = { chicken: 6, cat: 1, pig: 2, husky: 2, cow: 1 };
  const table = kc.planKibble({ counts, station: 'table', cycleDays: 3 });
  assert.ok(Math.abs(table.nutrition - 5.62) < 1e-9);
  assert.equal(table.piecesDay, 113); // 112.4
  assert.equal(table.cyclePieces, 338); // 337.2
  assert.equal(table.billsPerCycle, 7);
  assert.equal(table.meatPerCycle, 135); // 5.62*3/2.5*20 = 134.88
  assert.equal(table.vegPerCycle, 135);
  const spot = kc.planKibble({ counts, station: 'spot', cycleDays: 3 });
  assert.equal(spot.billsPerCycle, 10); // 337.2/35 = 9.63
  assert.equal(spot.meatPerCycle, 193); // 5.62*3/1.75*20 = 192.7
});

test('cycle clamps junk to 3 and bounds 1–10', () => {
  assert.equal(kc.clampCycle('x'), 3);
  assert.equal(kc.clampCycle(0), 1);
  assert.equal(kc.clampCycle(-9), 1);
  assert.equal(kc.clampCycle(2.9), 2);
  assert.equal(kc.clampCycle(99), 10);
});

test('cycle of 1 day equals the daily figure; 10 days scales', () => {
  const counts = { cow: 1 };
  const one = kc.planKibble({ counts, station: 'table', cycleDays: 1 });
  assert.equal(one.cyclePieces, one.piecesDay);
  const ten = kc.planKibble({ counts, station: 'table', cycleDays: 10 });
  assert.equal(ten.cyclePieces, Math.ceil(one.pieces * 10));
});

test('strict raw meat scales with the cycle', () => {
  const r = kc.planKibble({
    counts: { warg: 1, wolverine: 2, vulture: 1 },
    shown: ['warg', 'wolverine', 'vulture'],
    station: 'table', cycleDays: 3
  });
  assert.equal(r.strictMeatUnits, 31); // 1.51/0.05 = 30.2 per day
  assert.equal(r.strictMeatPerCycle, 91); // 1.51*3/0.05 = 90.6
});

test('parseCounts accepts string form and clamps junk', () => {
  const c = kc.parseCounts('chicken:6,husky:2,junk:9,pig:-4,thrumbo:999');
  assert.equal(c.chicken, 6);
  assert.equal(c.husky, 2);
  assert.equal(c.junk, undefined);
  assert.equal(c.pig, 0);
  assert.equal(c.thrumbo, 50);
});

test('encodeCounts round-trips through parseCounts', () => {
  const enc = kc.encodeCounts({ chicken: 6, warg: 1, cow: 0 });
  assert.equal(enc, 'chicken:6,warg:1');
  const back = kc.parseCounts(enc);
  assert.equal(back.chicken, 6);
  assert.equal(back.warg, 1);
  assert.equal(back.cow, 0);
});

test('parseShownList: absent = starter set, empty = none, junk dropped', () => {
  assert.deepEqual(kc.parseShownList(null), kc.STARTER);
  assert.deepEqual(kc.parseShownList(''), []);
  assert.deepEqual(kc.parseShownList([]), []);
  const s = kc.parseShownList('warg,chicken,junk,husky');
  assert.deepEqual(s, ['chicken', 'husky', 'warg']);
  assert.deepEqual(kc.parseShownList(['cat', 9, '']), ['cat']);
});

test('isStarterShown matches the starter set regardless of order', () => {
  assert.ok(kc.isStarterShown(kc.STARTER));
  assert.ok(kc.isStarterShown('cow,warg,chicken,cat,pig,husky'));
  assert.ok(!kc.isStarterShown('chicken'));
  assert.ok(!kc.isStarterShown(''));
});

test('filterAnimals searches Thai names and English ids, case-insensitive', () => {
  assert.equal(kc.filterAnimals('bear').length, 2); // Grizzly + Polar
  assert.deepEqual(
    kc.filterAnimals('fox').map((a) => a.id),
    ['redfox', 'arcticfox', 'fennecfox']
  );
  assert.equal(kc.filterAnimals('wolf').length, 3); // Timber + Arctic + Greatwolf
  assert.ok(kc.filterAnimals('FOX').length >= 3);
  assert.equal(kc.filterAnimals('').length, 95);
  assert.equal(kc.filterAnimals('   ').length, 95);
  assert.deepEqual(kc.filterAnimals('zzz'), []);
});

test('shown list filters the calculation but keeps stored counts', () => {
  const counts = { chicken: 6, cat: 1, pig: 2, husky: 2, cow: 1, warg: 1 };
  const r = kc.planKibble({ counts, shown: ['chicken'], station: 'table', buffer: 0 });
  assert.ok(Math.abs(r.nutrition - 1.32) < 1e-9);
  assert.equal(r.strictCount, 0);
  assert.equal(r.strictMeatUnits, 0);
  // hidden animals keep their counts
  assert.equal(r.counts.warg, 1);
  assert.equal(r.counts.chicken, 6);
});

test('hiding warg removes the strict bar data; unhiding restores it', () => {
  const base = { counts: { warg: 2, husky: 1 }, station: 'table', buffer: 0 };
  const withWarg = kc.planKibble({ ...base, shown: ['warg', 'husky'] });
  const noWarg = kc.planKibble({ ...base, shown: ['husky'] });
  assert.equal(withWarg.strictCount, 2);
  assert.equal(withWarg.strictMeatUnits, 16);
  assert.equal(noWarg.strictCount, 0);
  assert.equal(noWarg.strictMeatUnits, 0);
  // husky counts the same in both cases
  assert.ok(Math.abs(noWarg.nutrition - 0.8) < 1e-9);
});

test('parseKibbleState reads kcycle, ignores legacy kbuf; default cycle = 3', () => {
  const url = kc.parseKibbleState({ an: 'chicken:6', kb: 'spot', kcycle: '5', kshown: 'chicken,warg' });
  assert.deepEqual(url.shown, ['chicken', 'warg']);
  assert.equal(url.cycle, 5);
  const legacy = kc.parseKibbleState({ kbuf: 35, kcycle: 7 });
  assert.equal(legacy.cycle, 7);
  assert.equal(kc.parseKibbleState({}).cycle, 3);
  assert.equal(kc.defaultKibbleState().cycle, 3);
  const junk = kc.parseKibbleState({ an: '!!!', kb: 'microwave', kcycle: 'x' });
  assert.equal(junk.station, 'table');
  assert.equal(junk.cycle, 3);
  assert.equal(junk.counts.chicken, 0);
});

test('parseKibbleState kshown still parses arrays, empty and defaults', () => {
  const server = kc.parseKibbleState({ kshown: ['cat', 'pig'] });
  // re-ordered like the roster: pig (omni) before cat (carn)
  assert.deepEqual(server.shown, ['pig', 'cat']);
  assert.deepEqual(kc.parseKibbleState({ kshown: '' }).shown, []);
  assert.deepEqual(kc.parseKibbleState({}).shown, kc.STARTER);
});

test('zero animals → all zeros, never NaN', () => {
  const r = kc.planKibble({ counts: {}, station: 'spot', buffer: 0.5 });
  assert.equal(r.animalTotal, 0);
  assert.equal(r.piecesDay, 0);
  assert.equal(r.billsDay, 0);
  assert.equal(r.meatUnits, 0);
  assert.equal(r.vegUnits, 0);
  assert.equal(r.strictMeatUnits, 0);
  assert.equal(r.ricePlants, 0);
  assert.ok(Number.isFinite(r.pieces));
});

test('shown empty → zero results, never NaN', () => {
  const r = kc.planKibble({ counts: { husky: 3 }, shown: [], station: 'spot', buffer: 0.5 });
  assert.equal(r.animalTotal, 0);
  assert.equal(r.piecesDay, 0);
  assert.equal(r.strictMeatUnits, 0);
  assert.ok(Number.isFinite(r.nutrition));
});

test('quadrum (15 days) and rice plant equivalents', () => {
  const r = kc.planKibble({ counts: { cow: 1 }, station: 'table', cycleDays: 3 });
  assert.equal(r.quadrumPieces, 258); // 17.2*15 = 258
  // veg/day 0.86/2.5*20 = 6.88 → 7 units/day → 6.88*5.54/6 = 6.35 → 7 plants (per-day basis)
  assert.equal(r.vegUnits, 7);
  assert.equal(r.ricePlants, 7);
});

test('legacy 11-animal kshown from a saved session still works untouched', () => {
  const legacy = 'chicken,cat,alpaca,pig,husky,horse,cow,muffalo,dromedary,thrumbo,warg';
  const s = kc.parseKibbleState({ kshown: legacy });
  assert.equal(s.shown.length, 11);
  const r = kc.planKibble({ ...s, counts: kc.DEFAULT_COUNTS });
  // chicken 6 + cat 1 + pig 2 + husky 2 + cow 1 = 5.62 as before — legacy users stay continuous
  assert.ok(Math.abs(r.nutrition - 5.62) < 1e-9);
});
