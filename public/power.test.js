'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('./power.js');

test('1000 W × 11 h → 1 battery', () => {
  const r = P.batteriesNeeded(1000, 11);
  assert.equal(r.batteries, 1);
  assert.ok(r.needWd > 450 && r.needWd < 470);
  assert.equal(r.storedWd, 600);
});

test('2000 W × 11 h → 2 batteries', () => {
  const r = P.batteriesNeeded(2000, 11);
  assert.equal(r.batteries, 2);
  assert.equal(r.storedWd, 1200);
});

test('3600 W × 6 h → 2 batteries', () => {
  const r = P.batteriesNeeded(3600, 6);
  assert.equal(r.batteries, 2);
});

test('0 W → 0 batteries', () => {
  assert.equal(P.batteriesNeeded(0, 11).batteries, 0);
});

test('solar flare does not return a surviving battery count', () => {
  const r = P.flareReserve(4000);
  assert.equal(r.batteries, null);
});

test('parseWatts accepts typed digits and commas', () => {
  assert.equal(P.parseWatts('2000'), 2000);
  assert.equal(P.parseWatts('2,000'), 2000);
  assert.equal(P.parseWatts(' 1500 W'), 1500);
});

test('parseWatts rejects junk and clamps', () => {
  assert.equal(P.parseWatts('<script>1</script>'), 1);
  assert.equal(P.parseWatts('nope'), 0);
  assert.equal(P.parseWatts('999999'), 50000);
  assert.equal(P.parseWatts(-4), 0);
});

test('parseHours clamps 1–18 and defaults to 15', () => {
  assert.equal(P.parseHours(15), 15);
  assert.equal(P.parseHours(0), 1);
  assert.equal(P.parseHours(99), 18);
  assert.equal(P.parseHours('x'), 15);
});

test('1000 W × 15 h needs 2 batteries', () => {
  const r = P.batteriesNeeded(1000, 15);
  assert.equal(r.hours, 15);
  assert.equal(r.batteries, 2);
  assert.ok(r.needWd > 620 && r.needWd < 640);
});

test('omitted hours default to 15 solar-not-full window', () => {
  assert.equal(P.DEFAULT_HOURS, 15);
  assert.equal(P.parseAppState({}).hours, 15);
});

test('old night default 11 migrates to 15 unless schema is current', () => {
  assert.equal(P.parseAppState({ hours: 11 }).hours, 15);
  assert.equal(P.parseAppState({ hours: 11, schema: 2 }).hours, 15);
  assert.equal(P.parseAppState({ hours: 11, schema: 3 }).hours, 11);
  assert.equal(P.parseAppState({ hours: 6, schema: 2 }).hours, 6);
});

test('parseAppState keeps both tabs', () => {
  const s = P.parseAppState({
    tab: 'power',
    adults: 5,
    kids: 1,
    babies: 0,
    buffer: 0.2,
    pick: 'pemmican',
    watts: 1800,
    hours: 8,
    schema: 3
  });
  assert.equal(s.tab, 'power');
  assert.equal(s.adults, 5);
  assert.equal(s.kids, 1);
  assert.equal(s.watts, 1800);
  assert.equal(s.hours, 8);
  assert.equal(s.pick, 'pemmican');
  assert.equal(s.schema, 3);
});

test('parseAppState accepts grow tab', () => {
  assert.equal(P.parseAppState({ tab: 'grow' }).tab, 'grow');
});

test('parseAppState accepts drug, leather and settings tabs', () => {
  assert.equal(P.parseAppState({ tab: 'drug' }).tab, 'drug');
  assert.equal(P.parseAppState({ tab: 'leather' }).tab, 'leather');
  assert.equal(P.parseAppState({ tab: 'settings' }).tab, 'settings');
});

test('parseAppState drops invalid JSON-like objects', () => {
  const s = P.parseAppState({ tab: 'hack', watts: 'nope', pick: 'paste' });
  assert.equal(s.tab, 'food');
  assert.equal(s.watts, 1000);
  assert.equal(s.pick, 'simple');
});

test('defaultAppState is food 4+2 crew, 20% buffer, 1000 W × 15 h', () => {
  const d = P.defaultAppState();
  assert.equal(d.tab, 'food');
  assert.equal(d.adults, 4);
  assert.equal(d.kids, 2);
  assert.equal(d.babies, 0);
  assert.equal(d.buffer, 0.2);
  assert.equal(d.pick, 'simple');
  assert.equal(d.watts, 1000);
  assert.equal(d.hours, 15);
  assert.equal(d.schema, P.STATE_SCHEMA);
});
