'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const kc = require('./kibble.js');

test('hunger rates sum: 6 chickens + 1 cat + 2 pigs + 2 huskies + 1 cow = 5.62/day', () => {
  const r = kc.planKibble({
    counts: { chicken: 6, cat: 1, pig: 2, husky: 2, cow: 1 },
    station: 'table', buffer: 0
  });
  assert.ok(Math.abs(r.nutrition - 5.62) < 1e-9);
  assert.ok(Math.abs(r.pieces - 112.4) < 1e-6);
});

test('warg is excluded from kibble and counted as raw meat', () => {
  const r = kc.planKibble({
    counts: { warg: 1, husky: 1 },
    station: 'table', buffer: 0
  });
  assert.ok(Math.abs(r.nutrition - 0.8) < 1e-9);
  assert.equal(r.wargCount, 1);
  assert.ok(Math.abs(r.wargNutrition - 0.4) < 1e-9);
  assert.equal(r.wargMeatUnits, 8);
  assert.equal(r.piecesDay, 16);
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

test('buffer scales pieces and ingredients', () => {
  const none = kc.planKibble({ counts: { cow: 1 }, station: 'table', buffer: 0 });
  const with20 = kc.planKibble({ counts: { cow: 1 }, station: 'table', buffer: 0.2 });
  assert.equal(none.piecesDay, 18); // 0.86/0.05 = 17.2
  assert.equal(with20.piecesDay, 21); // 17.2*1.2 = 20.64
  assert.equal(none.meatUnits, 7); // 0.86/2.5*20 = 6.88
  assert.equal(with20.meatUnits, Math.ceil(none.nutrition * 1.2 / 2.5 * 20));
  assert.ok(with20.meatUnits > none.meatUnits);
});

test('buffer clamps junk to 0.2 and bounds 0–0.5', () => {
  assert.equal(kc.clampBuffer('x'), 0.2);
  assert.equal(kc.clampBuffer(9), 0.5);
  assert.equal(kc.clampBuffer(-3), 0);
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

test('parseKibbleState reads an/kb/kbuf URL form and defaults safely', () => {
  const s = kc.parseKibbleState({ an: 'chicken:6,husky:2', kb: 'spot', kbuf: '30' });
  assert.equal(s.counts.chicken, 6);
  assert.equal(s.station, 'spot');
  assert.ok(Math.abs(s.buffer - 0.3) < 1e-9);
  const d = kc.parseKibbleState({});
  assert.equal(d.station, 'table');
  assert.equal(d.buffer, 0.2);
  assert.deepEqual(d.counts, kc.parseCounts(kc.DEFAULT_COUNTS));
  const junk = kc.parseKibbleState({ an: '!!!', kb: 'microwave', kbuf: 'x' });
  assert.equal(junk.station, 'table');
  assert.equal(junk.counts.chicken, 0);
});

test('zero animals → all zeros, never NaN or negative', () => {
  const r = kc.planKibble({ counts: {}, station: 'spot', buffer: 0.5 });
  assert.equal(r.animalTotal, 0);
  assert.equal(r.piecesDay, 0);
  assert.equal(r.billsDay, 0);
  assert.equal(r.meatUnits, 0);
  assert.equal(r.vegUnits, 0);
  assert.equal(r.wargMeatUnits, 0);
  assert.equal(r.ricePlants, 0);
  assert.ok(Number.isFinite(r.pieces));
});

test('quadrum (15 days) and rice plant equivalents', () => {
  const r = kc.planKibble({ counts: { cow: 1 }, station: 'table', buffer: 0.2 });
  // 0.86*1.2 = 1.032 nut → 20.64 pieces → 310/quadrum
  assert.equal(r.quadrumPieces, 310);
  // veg 1.032/2.5*20 = 8.256 → 9 units/day → 9*5.54/6... use exact: 8.256*5.54/6 = 7.63 → 8 plants
  assert.equal(r.vegUnits, 9);
  assert.equal(r.ricePlants, 8);
});

test('parseShownList: absent = all, empty = none, junk dropped, order follows ANIMALS', () => {
  assert.equal(kc.parseShownList(null).length, kc.ANIMALS.length);
  assert.deepEqual(kc.parseShownList(''), []);
  assert.deepEqual(kc.parseShownList([]), []);
  const s = kc.parseShownList('warg,chicken,junk,husky');
  assert.deepEqual(s, ['chicken', 'husky', 'warg']);
  assert.deepEqual(kc.parseShownList(['cat', 9, '']), ['cat']);
});

test('shown list filters the calculation but keeps stored counts', () => {
  const counts = { chicken: 6, cat: 1, pig: 2, husky: 2, cow: 1, warg: 1 };
  const r = kc.planKibble({ counts, shown: ['chicken'], station: 'table', buffer: 0 });
  assert.ok(Math.abs(r.nutrition - 1.32) < 1e-9);
  assert.equal(r.wargCount, 0);
  assert.equal(r.wargMeatUnits, 0);
  // ตัวที่ซ่อนไว้เลขยังถูกจำใน counts
  assert.equal(r.counts.warg, 1);
  assert.equal(r.counts.chicken, 6);
});

test('hiding warg removes the warg line; unhiding restores it', () => {
  const base = { counts: { warg: 2, husky: 1 }, station: 'table', buffer: 0 };
  const withWarg = kc.planKibble({ ...base, shown: ['warg', 'husky'] });
  const noWarg = kc.planKibble({ ...base, shown: ['husky'] });
  assert.equal(withWarg.wargCount, 2);
  assert.equal(withWarg.wargMeatUnits, 16);
  assert.equal(noWarg.wargCount, 0);
  assert.equal(noWarg.wargMeatUnits, 0);
  // husky ยังนับเหมือนเดิมทั้งสองกรณี
  assert.ok(Math.abs(noWarg.nutrition - 0.8) < 1e-9);
});

test('parseKibbleState reads kshown from URL form and server form; default = all', () => {
  const url = kc.parseKibbleState({ an: 'chicken:6', kb: 'spot', kbuf: '30', kshown: 'chicken,warg' });
  assert.deepEqual(url.shown, ['chicken', 'warg']);
  const server = kc.parseKibbleState({ kshown: ['cat', 'pig'] });
  assert.deepEqual(server.shown, ['cat', 'pig']);
  const empty = kc.parseKibbleState({ kshown: '' });
  assert.deepEqual(empty.shown, []);
  assert.equal(kc.parseKibbleState({}).shown.length, kc.ANIMALS.length);
  assert.equal(kc.defaultKibbleState().shown.length, kc.ANIMALS.length);
});

test('shown empty → zero results, never NaN', () => {
  const r = kc.planKibble({ counts: { husky: 3 }, shown: [], station: 'spot', buffer: 0.5 });
  assert.equal(r.animalTotal, 0);
  assert.equal(r.piecesDay, 0);
  assert.equal(r.wargMeatUnits, 0);
  assert.ok(Number.isFinite(r.nutrition));
});
