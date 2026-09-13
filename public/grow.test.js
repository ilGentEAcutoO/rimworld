'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('./grow.js');

function close(actual, expected, eps) {
  assert.ok(Math.abs(actual - expected) < (eps || 0.015), actual + ' !~ ' + expected);
}

test('wiki rest factor 24/13', () => {
  close(G.REST, 24 / 13);
});

test('Potato soil 100% is 10.71 calendar days', () => {
  close(G.realDays('potato', 'soil'), 10.71);
});

test('Rice hydro 280% is 1.98 days', () => {
  close(G.realDays('rice', 'hydro'), 1.98);
});

test('Potato hydro uses 0.4 sensitivity → 6.23 not 10.71/2.8', () => {
  close(G.realDays('potato', 'hydro'), 6.23);
  assert.ok(G.realDays('potato', 'hydro') > 10.71 / 2.8 + 0.5);
});

test('Corn and Devilstrand cannot hydro', () => {
  assert.equal(G.realDays('corn', 'hydro'), null);
  assert.equal(G.realDays('devilstrand', 'hydro'), null);
  assert.equal(G.realDays('haygrass', 'hydro'), null);
});

test('listed growDays match wiki for the full sowable set', () => {
  const listed = {
    rice: 3, strawberry: 4.6, potato: 5.8, toxipotato: 4.9, corn: 11.3,
    haygrass: 7, nutrifungus: 6, cotton: 8, devilstrand: 22.5, fibercorn: 6,
    tinctoria: 2, healroot: 7, hops: 5, smokeleaf: 7.5, psychoid: 9
  };
  G.CROPS.forEach((c) => {
    assert.equal(c.grow, listed[c.id], c.id);
    assert.ok(c.name && !/[ก-๙]/.test(c.name), c.name);
  });
  assert.equal(G.CROPS.length, 15);
});

test('wiki soil real days for rice cotton psychoid', () => {
  close(G.realDays('rice', 'soil'), 5.54);
  close(G.realDays('cotton', 'soil'), 14.77);
  close(G.realDays('psychoid', 'soil'), 16.62);
  close(G.realDays('strawberry', 'soil'), 8.49);
  close(G.realDays('smokeleaf', 'soil'), 13.85);
  close(G.realDays('healroot', 'soil'), 12.92);
  close(G.realDays('hops', 'soil'), 9.23);
  close(G.realDays('tinctoria', 'soil'), 3.69);
  close(G.realDays('corn', 'soil'), 20.86);
  close(G.realDays('devilstrand', 'soil'), 41.54);
  close(G.realDays('nutrifungus', 'soil'), 11.08);
  close(G.realDays('toxipotato', 'soil'), 9.05);
});

test('hydro cotton and psychoid', () => {
  close(G.realDays('cotton', 'hydro'), 8 * (24 / 13) / 2.8);
  close(G.realDays('psychoid', 'hydro'), 9 * (24 / 13) / (1 + 1.8 * 0.4));
});

test('leave 14 pack 3 → deadline 11', () => {
  const w = G.growWindow(14, 3);
  assert.equal(w.leave, 14);
  assert.equal(w.pack, 3);
  assert.equal(w.deadline, 11);
});

test('leave 14 pack 3 soil potato harvests; corn and cotton skip', () => {
  assert.equal(G.verdict('potato', 'soil', 14, 3).tag, 'go');
  assert.equal(G.verdict('corn', 'soil', 14, 3).tag, 'no');
  assert.equal(G.verdict('cotton', 'soil', 14, 3).tag, 'no');
  assert.equal(G.verdict('cotton', 'hydro', 14, 3).tag, 'go');
});

test('no 70% partial harvest — cotton soil is skip not cut', () => {
  const v = G.verdict('cotton', 'soil', 14, 3);
  assert.equal(v.tag, 'no');
  assert.notEqual(v.label, 'cut');
});

test('leave 7 pack 3 hydro: rice and strawberry go, potato skip', () => {
  assert.equal(G.verdict('rice', 'hydro', 7, 3).tag, 'go');
  assert.equal(G.verdict('strawberry', 'hydro', 7, 3).tag, 'go');
  assert.equal(G.verdict('potato', 'hydro', 7, 3).tag, 'no');
});

test('leave 7 pack 0 hydro potato harvests', () => {
  assert.equal(G.verdict('potato', 'hydro', 7, 0).tag, 'go');
});

test('open plan has no deadline and does not skip long crops', () => {
  const w = G.growWindow(null, 3);
  assert.equal(w.open, true);
  assert.equal(w.leave, null);
  assert.equal(w.deadline, null);
  assert.equal(G.verdict('cotton', 'soil', null, 3).tag, 'plan');
  assert.equal(G.verdict('corn', 'soil', null, 3).tag, 'plan');
  assert.equal(G.verdict('corn', 'hydro', null, 3).tag, 'no');
  const foods = G.planCrops({ soil: 'soil', sort: 'days' }).rows.filter((r) => r.kind === 'food');
  assert.equal(foods[0].id, 'corn');
  assert.ok(foods[0].real > foods[1].real);
});

test('parseLeave / parsePack clamp', () => {
  assert.equal(G.parseLeave('x'), null);
  assert.equal(G.parseLeave('open'), null);
  assert.equal(G.parseLeave(1), 2);
  assert.equal(G.parseLeave(99), 30);
  assert.equal(G.parsePack('x'), 3);
  assert.equal(G.parsePack(-2), 0);
  assert.equal(G.parsePack(9), 5);
});

test('planCrops groups Food→Textile→Drug; days sort sows long-first', () => {
  const all = G.planCrops({ soil: 'soil', leave: 14, pack: 3, sort: 'days' });
  assert.equal(all.deadline, 11);
  assert.equal(all.sort, 'days');
  assert.equal(all.rows[0].kind, 'food');
  const foods = all.rows.filter((r) => r.kind === 'food');
  const sow = foods.filter((r) => r.ok);
  const skip = foods.filter((r) => !r.ok);
  assert.deepEqual(sow.map((r) => r.id), ['potato', 'toxipotato', 'strawberry', 'rice']);
  assert.ok(skip[0].real >= skip[1].real);
  const az = G.planCrops({ soil: 'soil', leave: 14, pack: 3, sort: 'az' });
  const foodNames = az.rows.filter((r) => r.kind === 'food').map((r) => r.name);
  assert.deepEqual(foodNames, foodNames.slice().sort((a, b) => a.localeCompare(b)));
  const cotton = all.rows.find((r) => r.id === 'cotton');
  assert.equal(cotton.listed, 8);
  close(cotton.real, 14.77);
});

test('Potato 14 days at 76% implies ~58% growth rate', () => {
  const d = G.diagnose({ crop: 'potato', soil: 'soil', days: 14, percent: 76 });
  close(d.expected, 100);
  close(d.impliedGrf, 0.581, 0.01);
  close(d.soilGrf, 1);
});

test('parseShown keeps only known ids and missing means all', () => {
  assert.deepEqual(G.parseShown(null).slice().sort(), G.allCropIds().slice().sort());
  assert.deepEqual(G.parseShown(['rice', 'nope', 'cotton', 'rice']), ['rice', 'cotton']);
  assert.deepEqual(G.parseShown('psychoid,cotton'), ['psychoid', 'cotton']);
  assert.deepEqual(G.parseShown(''), []);
  assert.deepEqual(G.parseShown('hay,rice'), ['haygrass', 'rice']);
});

test('planCrops shown list still groups by kind', () => {
  const r = G.planCrops({ soil: 'soil', leave: 14, pack: 3, shown: ['psychoid', 'rice', 'cotton'] });
  assert.deepEqual(r.rows.map((x) => x.id), ['rice', 'cotton', 'psychoid']);
  assert.equal(r.rows[0].kind, 'food');
  assert.equal(r.rows[1].kind, 'textile');
  assert.equal(r.rows[2].kind, 'drug');
});

test('planCrops lists every shown crop even when kind is a single group', () => {
  const r = G.planCrops({
    soil: 'soil',
    kind: 'drug',
    sort: 'az',
    shown: ['rice', 'cotton', 'healroot', 'psychoid', 'potato', 'haygrass', 'corn']
  });
  assert.deepEqual(r.rows.map((x) => x.id), [
    'corn', 'haygrass', 'potato', 'rice', 'cotton', 'healroot', 'psychoid'
  ]);
});

test('parseGrowState keeps hydro + drug + custom leave', () => {
  const s = G.parseGrowState({
    soil: 'hydro', kind: 'drug', leave: 20, pack: 2, diagCrop: 'cotton', diagDays: 9, diagPercent: 40
  });
  assert.equal(s.soil, 'hydro');
  assert.equal(s.kind, 'drug');
  assert.equal(G.parseGrowState({}).sort, 'days');
  assert.equal(s.leave, 20);
  assert.equal(G.parseGrowState({}).leave, null);
  assert.equal(s.pack, 2);
  assert.equal(s.diagCrop, 'cotton');
  assert.equal(s.diagDays, 9);
  assert.equal(s.diagPercent, 40);
});

test('parseGrowState defaults open leave, pack 3, soil and potato 76%', () => {
  const s = G.parseGrowState({});
  assert.equal(s.leave, null);
  assert.equal(s.pack, 3);
  assert.equal(s.soil, 'soil');
  assert.equal(s.diagCrop, 'potato');
  assert.equal(s.diagDays, 14);
  assert.equal(s.diagPercent, 76);
  const d = G.defaultGrowState();
  assert.equal(d.leave, null);
  assert.equal(d.pack, 3);
  assert.equal(d.sort, 'days');
  assert.deepEqual(d.shown, G.allCropIds());
});

test('parseGrowState keeps leave 14 from URL, open only when marked open', () => {
  assert.equal(G.parseGrowState({ leave: '14' }).leave, 14);
  assert.equal(G.parseGrowState({ leave: 14 }).leave, 14);
  assert.equal(G.parseGrowState({ leave: 'open' }).leave, null);
  assert.equal(G.parseGrowState({ leave: 14, leaveSet: false }).leave, null);
  assert.equal(G.parseGrowState({ leave: 12, leaveSet: true }).leave, 12);
});

test('diagnose clamps junk percent and days', () => {
  const d = G.diagnose({ crop: 'rice', soil: 'hydro', days: 'nope', percent: 900 });
  assert.equal(d.days, 0);
  assert.equal(d.percent, 100);
});

test('tempFactor full band inside ideal is 1 and defaults match', () => {
  close(G.tempFactor(7, 41), 1);
  close(G.tempFactor(41, 7), 1);
  assert.equal(G.DEFAULT_HEAT, 7);
  assert.equal(G.DEFAULT_COOL, 41);
  close(G.tempFactor(), 1);
});

test('tempFactor averages wiki piecewise curve across the band', () => {
  close(G.tempFactor(0, 12), 0.75, 0.001);
  close(G.tempFactor(3, 3), 0.5, 0.001);
  close(G.tempFactor(45, 45), (58 - 45) / 16, 0.001);
  close(G.tempFactor(-20, -10), 0, 0.001);
  close(G.tempFactor(-5, 6), 3 / 11, 0.001);
});

test('tempFactor cold point explains potato implied rate ~0.58', () => {
  close(G.grfAtTemp(3.5), G.tempFactor(3, 4), 0.01);
  close(G.tempFactor(3, 4), 0.583, 0.02);
});

test('diagnose uses heat/cool band for expected', () => {
  const d = G.diagnose({ crop: 'potato', soil: 'soil', days: 14, percent: 76, heat: 0, cool: 12 });
  close(d.tempGrf, 0.75, 0.001);
  close(d.expected, 100 * 14 * 0.75 / (5.8 * 24 / 13), 0.2);
  const hot = G.diagnose({ crop: 'potato', soil: 'soil', days: 14, percent: 76, heat: 50, cool: 60 });
  close(hot.tempGrf, 2 / 10, 0.001);
});

test('parseGrowState clamps heat/cool and defaults 7/41', () => {
  const s = G.parseGrowState({ heat: 'x', cool: '999' });
  assert.equal(s.heat, 7);
  assert.equal(s.cool, 80);
  assert.equal(G.parseGrowState({ cool: 'nope' }).cool, 41);
  assert.equal(G.parseGrowState({ heat: -30 }).heat, -20);
  assert.equal(G.parseGrowState({ heat: '3' }).heat, 3);
});
