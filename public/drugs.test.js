'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('./drugs.js');

test('the tool keeps exactly the 5 work/psychoid drugs, no recreation-only ones', () => {
  const ids = D.DRUGS.map((d) => d.id).sort();
  assert.deepEqual(ids, ['flake', 'gojuice', 'psychitetea', 'wakeup', 'yayo']);
});

test('drugById falls back to wake-up for unknown id', () => {
  assert.equal(D.drugById('nope').id, 'wakeup');
  assert.equal(D.drugById('flake').id, 'flake');
});

test('drugsForTrait filters to the drugs each trait actually affects', () => {
  const hussar = D.drugsForTrait('hussar').map((d) => d.id);
  assert.deepEqual(hussar, ['gojuice']);

  const waster = D.drugsForTrait('waster').map((d) => d.id);
  assert.ok(waster.includes('wakeup'));
  assert.ok(waster.includes('yayo'));
  assert.ok(waster.includes('flake'));
  assert.ok(waster.includes('psychitetea'));
  assert.ok(!waster.includes('gojuice'));

  const baseliner = D.drugsForTrait('baseliner').map((d) => d.id);
  assert.equal(baseliner.length, D.DRUGS.length);
});

test('rankedDrugsForTrait sorts hardest-to-overdose (lowest odChance) first', () => {
  const ranked = D.rankedDrugsForTrait('baseliner').map((d) => d.id);
  assert.equal(ranked[0], 'psychitetea');
  assert.equal(ranked[ranked.length - 1], 'flake');
  const odByRank = ranked.map((id) => D.drugById(id).odChance);
  for (let i = 1; i < odByRank.length; i++) {
    assert.ok(odByRank[i] >= odByRank[i - 1]);
  }
});

test('bestDrugForTrait auto-picks with no manual choice required', () => {
  assert.equal(D.bestDrugForTrait('baseliner'), 'psychitetea');
  assert.equal(D.bestDrugForTrait('chemFascination'), 'psychitetea');
  assert.equal(D.bestDrugForTrait('hussar'), 'gojuice');
  assert.equal(D.bestDrugForTrait('waster'), 'wakeup');
  assert.equal(D.bestDrugForTrait('customDependency'), 'wakeup');
});

test('secondaryDrugForTrait surfaces Waster\'s second (dependency) obligation', () => {
  assert.equal(D.secondaryDrugForTrait('waster'), 'psychitetea');
  assert.equal(D.secondaryDrugForTrait('hussar'), null);
  assert.equal(D.secondaryDrugForTrait('baseliner'), null);
});

test('modifierForTraitDrug resolves Waster to different genes per drug', () => {
  assert.equal(D.modifierForTraitDrug('waster', 'wakeup'), 'wakeupImpervious');
  assert.equal(D.modifierForTraitDrug('waster', 'yayo'), 'psychiteDependency');
  assert.equal(D.modifierForTraitDrug('waster', 'flake'), 'psychiteDependency');
  assert.equal(D.modifierForTraitDrug('hussar', 'gojuice'), 'gojuiceDependency');
  assert.equal(D.modifierForTraitDrug('baseliner', 'flake'), 'none');
  assert.equal(D.modifierForTraitDrug('chemFascination', 'flake'), 'chemFascination');
});

test('parseTrait/parseDrug reject junk and fall back to the recommended drug', () => {
  assert.equal(D.parseTrait('<script>'), 'baseliner');
  assert.equal(D.parseTrait('hussar'), 'hussar');
  assert.equal(D.parseDrug('nope', 'baseliner'), 'psychitetea');
  assert.equal(D.parseDrug('flake', 'hussar'), 'gojuice');
  assert.equal(D.parseDrug('yayo', 'waster'), 'yayo');
  assert.equal(D.parseDrug('gojuice', 'waster'), 'wakeup');
});

test('stackForTrait: Hussar can combine Go-juice (gene-free) with a naturally 0%-overdose drug', () => {
  const rows = D.stackForTrait('hussar');
  const ids = rows.map((r) => r.drug.id);
  assert.ok(ids.includes('gojuice'));
  assert.ok(ids.includes('psychitetea'));
  assert.equal(rows.find((r) => r.drug.id === 'gojuice').coverage, 'gene');
  assert.equal(rows.find((r) => r.drug.id === 'psychitetea').coverage, 'zero-risk');
});

test('stackForTrait: Waster gets two gene-covered drugs (Wake-up + a psychite feeder)', () => {
  const rows = D.stackForTrait('waster');
  const ids = rows.map((r) => r.drug.id);
  assert.deepEqual(ids.sort(), ['psychitetea', 'wakeup']);
  assert.ok(rows.every((r) => r.coverage === 'gene'));
});

test('stackForTrait: a trait with no special gene still gets a zero-risk psychite tea add-on', () => {
  const rows = D.stackForTrait('baseliner');
  const ids = rows.map((r) => r.drug.id);
  assert.ok(ids.includes('psychitetea'));
  assert.equal(ids.filter((id) => id === 'psychitetea').length, 1);
});

test('stackForTrait: customDependency\'s wakeup has ordinary risk, still gets a zero-risk add-on', () => {
  const rows = D.stackForTrait('customDependency');
  const wakeupRow = rows.find((r) => r.drug.id === 'wakeup');
  assert.ok(wakeupRow);
  assert.equal(wakeupRow.coverage, 'normal');
  assert.ok(rows.some((r) => r.coverage === 'zero-risk'));
});

test('FREQ_STEPS is one ascending scale from many-times-a-day to once-every-90-days', () => {
  for (let i = 1; i < D.FREQ_STEPS.length; i++) {
    assert.ok(D.FREQ_STEPS[i] > D.FREQ_STEPS[i - 1]);
  }
  assert.ok(D.FREQ_STEPS[0] < 1);
  assert.ok(D.FREQ_STEPS[D.FREQ_STEPS.length - 1] >= 90);
});

test('freqIndexToDays / clampFreqIndex round-trip and clamp out-of-range indices', () => {
  assert.equal(D.freqIndexToDays(0), D.FREQ_STEPS[0]);
  assert.equal(D.freqIndexToDays(D.FREQ_STEPS.length - 1), D.FREQ_STEPS[D.FREQ_STEPS.length - 1]);
  assert.equal(D.freqIndexToDays(-5), D.FREQ_STEPS[0]);
  assert.equal(D.freqIndexToDays(999), D.FREQ_STEPS[D.FREQ_STEPS.length - 1]);
  assert.equal(D.clampFreqIndex('nope'), D.FREQ_STEPS.indexOf(1));
});

test('nearestFreqIndex snaps an arbitrary days value to the closest step', () => {
  assert.equal(D.FREQ_STEPS[D.nearestFreqIndex(1)], 1);
  assert.equal(D.FREQ_STEPS[D.nearestFreqIndex(2)], 2);
  assert.equal(D.FREQ_STEPS[D.nearestFreqIndex(0.5)], 0.5);
  // 2.9 is much closer to 3 than to 2 on a log scale
  assert.equal(D.FREQ_STEPS[D.nearestFreqIndex(2.9)], 3);
});

test('formatFrequency mirrors the in-game slider wording on one scale', () => {
  assert.equal(D.formatFrequency(1), 'วันละครั้ง');
  assert.equal(D.formatFrequency(0.5), 'วันละ 2 ครั้ง');
  assert.equal(D.formatFrequency(0.25), 'วันละ 4 ครั้ง');
  assert.equal(D.formatFrequency(2), 'ทุก 2 วัน');
  assert.equal(D.formatFrequency(3), 'ทุก 3 วัน');
  assert.equal(D.formatFrequency(90), 'ทุก 90 วัน');
});

test('parseIntervalDays clamps to the FREQ_STEPS range and rejects junk', () => {
  assert.equal(D.parseIntervalDays(0), 1);
  assert.equal(D.parseIntervalDays(-4), 1);
  assert.equal(D.parseIntervalDays('x'), 1);
  assert.equal(D.parseIntervalDays(999), D.FREQ_STEPS[D.FREQ_STEPS.length - 1]);
  assert.equal(D.parseIntervalDays(4), 4);
});

test('cumulativeOdChance compounds per-dose risk', () => {
  assert.equal(D.cumulativeOdChance(0, 10), 0);
  const p = D.cumulativeOdChance(0.01, 1);
  assert.ok(Math.abs(p - 0.01) < 1e-9);
  const p10 = D.cumulativeOdChance(0.01, 10);
  assert.ok(p10 > 0.09 && p10 < 0.1);
});

test('safeIntervalDays matches wiki-derived tolerance ratios', () => {
  assert.ok(Math.abs(D.safeIntervalDays(D.drugById('psychitetea')) - 2) < 1e-9);
  assert.ok(Math.abs(D.safeIntervalDays(D.drugById('flake')) - (4 / 1.5)) < 1e-9);
  assert.equal(D.safeIntervalDays(D.drugById('wakeup')), 3);
});

test('evaluate: baseliner flake once every few days carries real overdose risk', () => {
  const r = D.evaluate({ trait: 'baseliner', drug: 'flake', intervalDays: 4 });
  assert.ok(r.odPct > 0);
  assert.equal(r.dependency, false);
  assert.equal(r.intervalDays, 4);
  assert.notEqual(r.verdict.level, undefined);
});

test('evaluate: waster on wake-up is immune, waster on yayo is a dependency', () => {
  const wu = D.evaluate({ trait: 'waster', drug: 'wakeup', intervalDays: 1 / 6 });
  assert.equal(wu.odPct, 0);
  assert.equal(wu.verdict.level, 'ok');
  assert.equal(wu.dependency, false);

  const yayo = D.evaluate({ trait: 'waster', drug: 'yayo', intervalDays: 40 });
  assert.equal(yayo.dependency, true);
  assert.equal(yayo.verdict.level, 'bad');
});

test('evaluate: hussar go-juice dependency requires periodic dosing, not a daily cap', () => {
  const safe = D.evaluate({ trait: 'hussar', drug: 'gojuice', intervalDays: 10 });
  assert.equal(safe.dependency, true);
  assert.equal(safe.verdict.level, 'ok');

  const risky = D.evaluate({ trait: 'hussar', drug: 'gojuice', intervalDays: 45 });
  assert.equal(risky.verdict.level, 'bad');
});

test('evaluate: overStackWarning fires when dosing faster than the drug\'s own high lasts', () => {
  const r = D.evaluate({ trait: 'baseliner', drug: 'wakeup', intervalDays: 1 / 6 });
  assert.ok(r.overStackWarning);
  const ok = D.evaluate({ trait: 'baseliner', drug: 'wakeup', intervalDays: 1 });
  assert.equal(ok.overStackWarning, null);
});

test('recommendedIntervalDays keeps the default verdict clean (matches the drug\'s own safe interval)', () => {
  assert.ok(Math.abs(D.recommendedIntervalDays('psychitetea') - 2) < 1e-9);
  assert.equal(D.recommendedIntervalDays('wakeup'), 3);
});

test('recommendedIntervalDays is trait-aware: gene-protected drugs open on a daily regimen', () => {
  assert.equal(D.recommendedIntervalDays('gojuice', 'hussar'), 1);
  assert.equal(D.recommendedIntervalDays('wakeup', 'waster'), 1);
  assert.equal(D.recommendedIntervalDays('yayo', 'waster'), 1);
  assert.equal(D.recommendedIntervalDays('wakeup', 'customDependency'), 1);
  assert.equal(D.recommendedIntervalDays('wakeup', 'baseliner'), 3);
});

test('parseDrugState / defaultDrugState round-trip, defaulting to the safest drug at its safe cadence', () => {
  const d = D.defaultDrugState();
  assert.equal(d.trait, 'baseliner');
  assert.equal(d.drug, 'psychitetea');
  assert.ok(Math.abs(d.intervalDays - 2) < 1e-9);
  const r = D.evaluate(d);
  assert.equal(r.verdict.level, 'ok');

  const s = D.parseDrugState({ trait: 'hussar', drug: 'flake', intervalDays: 5 });
  assert.equal(s.trait, 'hussar');
  assert.equal(s.drug, 'gojuice');
  assert.equal(s.intervalDays, 5);
});

test('parseDrugState with no stored intervalDays (fresh page load) still opens on a clean verdict', () => {
  const s = D.parseDrugState({});
  assert.equal(s.drug, 'psychitetea');
  assert.ok(Math.abs(s.intervalDays - 2) < 1e-9);
  assert.equal(D.evaluate(s).verdict.level, 'ok');

  const hussar = D.parseDrugState({ trait: 'hussar' });
  assert.equal(hussar.drug, 'gojuice');
  assert.equal(hussar.intervalDays, 1);

  const waster = D.parseDrugState({ trait: 'waster' });
  assert.equal(waster.drug, 'wakeup');
  assert.equal(waster.intervalDays, 1);
});

test('evaluate never throws for every trait × its own available drugs', () => {
  D.TRAITS.forEach((trait) => {
    D.drugsForTrait(trait.id).forEach((drug) => {
      assert.doesNotThrow(() => {
        D.evaluate({ trait: trait.id, drug: drug.id, intervalDays: 1 });
      });
    });
  });
});

test('evaluate: addiction risk is surfaced for unprotected drugs, absent for gene-protected ones', () => {
  const r = D.evaluate({ trait: 'baseliner', drug: 'wakeup', intervalDays: 1 });
  assert.ok(r.addictionRisk);
  assert.equal(r.addictionRisk.chancePerDose, 0.02);
  assert.equal(r.addictionRisk.expectedDoses, 50);
  // daily dosing for 30 days: 1 - (1 - 0.02)^30 ≈ 45.5%
  assert.ok(r.addictionRisk.pct30d > 0.44 && r.addictionRisk.pct30d < 0.47);
  assert.ok(r.notes.some((n) => n.includes('ติดภายใน 30 วัน')));

  const immune = D.evaluate({ trait: 'waster', drug: 'wakeup', intervalDays: 1 });
  assert.equal(immune.addictionRisk, null);

  const dep = D.evaluate({ trait: 'hussar', drug: 'gojuice', intervalDays: 1 });
  assert.equal(dep.addictionRisk, null);
});

test('stackForTrait rows carry a cadence prescription for the combo', () => {
  const hussar = D.stackForTrait('hussar');
  assert.equal(hussar.find((r) => r.drug.id === 'gojuice').cadence, 'วันละ 1 เข็ม');
  // tea add-on has NO hussar gene protection — cadence follows its own tolerance, not daily
  assert.equal(hussar.find((r) => r.drug.id === 'psychitetea').cadence, 'ทุก 2 วัน');
  assert.ok(hussar.every((r) => r.cadence && r.cadence.length > 0));

  const waster = D.stackForTrait('waster');
  assert.equal(waster.find((r) => r.drug.id === 'psychitetea').cadence, 'ทุก 2–5 วัน');
});
