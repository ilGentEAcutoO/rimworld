'use strict';

/*
 * Safe-dosing guide for RimWorld chemicals — approximate numbers assembled
 * from the RimWorld wiki (1.5/1.6, Biotech) as a practical player guide,
 * NOT exact engine formulas. Check the drug's in-game tooltip / policy
 * screen for the live numbers on your current version.
 *
 * Flow: pick a trait/xenotype gene first, then pick which of the drugs it
 * actually affects, then a doses-per-day rate to see the risk + the
 * equivalent Drug Policy "Frequency" setting to type into the game.
 */

var WEEK_DAYS = 7;

var DRUGS = [
  {
    id: 'wakeup',
    name: 'Wake-up',
    group: 'work',
    groupLabel: 'Work drugs',
    workFocus: true,
    effect: '+50% work speed · +10% consciousness · +10% moving · restores rest to 100% instantly · slower sleep (×80% sleep fall rate) · +20% psyfocus',
    odChance: 0.005,
    addictChance: 0.02,
    toleranceGain: null,
    toleranceDecay: null,
    heuristicSafeDays: 3,
    minRedoseHours: 12,
    firstRedoseHours: 8,
    safetyNote: 'Lasts ~12 h. No re-dose before 8 h (first dose), then 12 h+ between doses — tighter dosing just stacks severity past 100% for nothing'
  },
  {
    id: 'gojuice',
    name: 'Go-juice',
    group: 'work',
    groupLabel: 'Work drugs',
    workFocus: true,
    effect: '+consciousness · +moving · +sight · pain reduction · +psyfocus · better saved for combat/emergencies than daily work',
    odChance: 0.005,
    addictChance: 0.026,
    toleranceGain: null,
    toleranceDecay: null,
    heuristicSafeDays: 3,
    minRedoseHours: 16,
    firstRedoseHours: 4.8,
    safetyNote: 'Lasts ~16 h. No re-dose before 4.8 h and 16 h+ between doses so nothing is wasted — not a daily work drug, keep it for emergencies'
  },
  {
    id: 'psychitetea',
    name: 'Psychite tea',
    group: 'work',
    groupLabel: 'Work drugs',
    workFocus: true,
    effect: '+12 mood · ×80% sleep fall rate (stay awake longer) · ×90% pain — zero overdose chance, the safest pick for cutting sleep',
    odChance: 0,
    addictChance: 0.02,
    toleranceGain: 0.03,
    toleranceDecay: 0.015,
    safetyNote: 'No overdose risk at all — only tolerance/addiction matter; just follow the safe interval below'
  },
  {
    id: 'yayo',
    name: 'Yayo',
    group: 'psychoid',
    groupLabel: 'Psychoid raw/processed',
    workFocus: false,
    effect: '+35 mood · pain reduction · better moving · slightly less sleep needed',
    odChance: 0.01,
    addictChance: 0.01,
    toleranceGain: 0.04,
    toleranceDecay: 0.015,
    safetyNote: 'Tolerance above 45% risks permanent kidney damage — never dose tighter than the safe interval below'
  },
  {
    id: 'flake',
    name: 'Flake',
    group: 'psychoid',
    groupLabel: 'Psychoid raw/processed',
    workFocus: false,
    effect: '+35 mood · pain reduction · better moving — cheaper and easier to make than yayo but far more addictive',
    odChance: 0.015,
    addictChance: 0.05,
    toleranceGain: 0.04,
    toleranceDecay: 0.015,
    safetyNote: 'Highest addiction chance in this group at 5% per dose — avoid regular use; keep it for sale or true emergencies'
  },
];

/*
 * Only the 5 drugs relevant to "work harder / sleep less" builds are kept
 * here on purpose (no Smokeleaf/Beer/Ambrosia/Luciferium/Painkiller) — the
 * tool auto-picks from this short list so there's nothing extra to weigh.
 */

var ALL_DRUG_IDS = DRUGS.map(function (d) { return d.id; });

var MODIFIERS = [
  { id: 'none', name: 'None (plain baseliner)' },
  {
    id: 'chemFascination',
    name: 'Trait: Chemical fascination',
    note: 'Does not lower overdose chance — it raises risk because the pawn secretly binges more often than your policy says (always ignores "no recreation"). Policy alone cannot control it; budget extra stock and mood swings',
    riskBump: 1
  },
  {
    id: 'chemInterest',
    name: 'Trait: Chemical interest',
    note: 'Like Chemical fascination but milder — can still self-administer when mood is low; keep some spare stock',
    riskBump: 0.5
  },
  {
    id: 'chemDamageNone',
    name: 'Gene: Chemical damage — none',
    note: 'If an overdose does happen there is no permanent organ damage/death — but the per-dose overdose chance is unchanged; you still lose time and mood',
    consequenceMult: 0
  },
  {
    id: 'chemDamageReduced',
    name: 'Gene: Chemical damage — reduced',
    note: 'Overdose damage is halved if it happens, but the chance stays the same',
    consequenceMult: 0.5
  },
  {
    id: 'chemDamageIncreased',
    name: 'Gene: Chemical damage — increased',
    note: 'Overdose damage is worse than normal if it happens — add margin and space doses further apart than the calculated interval',
    consequenceMult: 2,
    riskBump: 1
  },
  {
    id: 'wakeupImpervious',
    name: 'Gene: Wake-up impervious',
    note: 'Full immunity to both addiction and overdose (random and cumulative) from Wake-up specifically — dose as often as you like, only stacked highs go to waste. Does not cover flake/yayo/go-juice. The one thing the gene does not fix: wake-up has a rare heart-attack chance while active (anyone can get it) — a prosthetic/bionic heart prevents it 100%',
    immune: true
  },
  {
    id: 'gojuiceDependency',
    name: 'Gene: Go-juice dependency',
    note: 'The dependency gene removes Go-juice random overdose and addiction entirely — unlimited injections with zero health downside, plus +4 metabolic efficiency. The only burden is regular intake: past ~5 days mood drops, ~30 days coma, ~60 days death',
    dependency: true
  },
  {
    id: 'psychiteDependency',
    name: 'Gene: Psychite dependency',
    note: 'The dependency gene blocks overdose (random+cumulative) and addiction for every psychite form — tea/yayo/flake, any of them tops up the need. Only the regular-intake burden remains (>5 days mood drop, ~30 days coma, ~60 days death) plus one health caveat: tolerance still exists — only very heavy use (~11 back-to-back doses) triggers kidney damage; keep ≥5 days/dose and the kidneys stay safe forever',
    dependency: true
  },
  {
    id: 'genericDependency',
    name: 'Gene: [this drug] dependency (custom xenotype)',
    note: 'A custom per-drug dependency gene (from the gene editor) — same mechanism as Hussar/Waster: immunity to this drug\'s normal overdose/addiction in exchange for a regular intake requirement',
    dependency: true
  }
];

/*
 * Traits/xenotypes come first in the UI. Each one resolves to a MODIFIERS
 * id (fixed, or computed per-drug for Waster) plus which drugs it's
 * actually relevant to.
 */
var TRAITS = [
  {
    id: 'baseliner',
    name: 'None / plain baseliner',
    drugFilter: null,
    modifier: 'none',
    note: 'A normal human with no chemistry genes/traits — the base drug numbers from the table apply'
  },
  {
    id: 'chemFascination',
    name: 'Trait: Chemical fascination',
    drugFilter: null,
    modifier: 'chemFascination'
  },
  {
    id: 'chemInterest',
    name: 'Trait: Chemical interest',
    drugFilter: null,
    modifier: 'chemInterest'
  },
  {
    id: 'teetotaler',
    name: 'Trait: Teetotaler',
    drugFilter: null,
    modifier: 'none',
    note: 'Normally refuses recreational drugs without orders — this tool only matters for doses you order for work/medicine; everything else uses base values'
  },
  {
    id: 'chemDamageNone',
    name: 'Gene: Chemical damage — none',
    drugFilter: null,
    modifier: 'chemDamageNone'
  },
  {
    id: 'chemDamageReduced',
    name: 'Gene: Chemical damage — reduced',
    drugFilter: null,
    modifier: 'chemDamageReduced'
  },
  {
    id: 'chemDamageIncreased',
    name: 'Gene: Chemical damage — increased',
    drugFilter: null,
    modifier: 'chemDamageIncreased'
  },
  {
    id: 'hussar',
    name: 'Xenotype: Hussar',
    drugFilter: ['gojuice'],
    autoDrug: 'gojuice',
    modifier: 'gojuiceDependency',
    note: 'Hussars are born with Go-juice dependency — unlimited Go-juice with no overdose (even random), no addiction, no health effects. Other drugs the gene does not touch use normal base values',
    stack: [
      { drug: 'gojuice', coverage: 'gene', cadence: '1 dose/day', note: 'Free straight from the gene — ~16 h of effect, one dose covers a whole work day; extra combat doses cost nothing' }
    ]
  },
  {
    id: 'waster',
    name: 'Xenotype: Waster',
    drugFilter: ['wakeup', 'yayo', 'flake', 'psychitetea'],
    primaryDrug: 'wakeup',
    secondaryDrug: 'psychitetea',
    modifierByDrug: function (drugId) {
      return drugId === 'wakeup' ? 'wakeupImpervious' : 'psychiteDependency';
    },
    note: 'Waster = Wake-up impervious + Psychite dependency — the best drug stacking in the game: unlimited Wake-up with no OD/addiction (only the rare heart-attack chance remains) and any psychite form freely with no OD/addiction; just keep the dependency fed',
    stack: [
      { drug: 'wakeup', coverage: 'gene', cadence: '1 dose/day', note: 'Free from the impervious gene — ~12 h of effect, a morning dose covers the work day; never inject more often than 8 h or highs stack for nothing' },
      { drug: 'psychitetea', coverage: 'gene', cadence: 'every 2–5 days', note: 'Feeds the Psychite dependency directly — tea is fine every 2 days without building tolerance; rotate flake (every 2.7 days) which is cheaper and more efficient per psychoid leaf, yayo is strongest. Whichever form, ≤5 days/dose keeps the kidneys safe for life' }
    ]
  },
  {
    id: 'customDependency',
    name: 'Gene: [this drug] dependency (custom xenotype)',
    drugFilter: ['wakeup', 'gojuice', 'yayo', 'flake', 'psychitetea'],
    primaryDrug: 'wakeup',
    modifier: 'genericDependency',
    note: 'The example uses Wake-up — if your custom gene binds a different drug in this group the math is identical, only the drug name changes'
  }
];

var DEP_GRACE_DAYS = 5;
var DEP_COMA_DAYS = 30;
var DEP_DEATH_DAYS = 60;
var DEP_SAFE_MARGIN_DAYS = 27;

/*
 * A single scale, same idea as the game's own Drug Policy "Frequency"
 * slider: one line from many-times-a-day (left) to once-every-many-days
 * (right). No separate "times/day" vs "every N days" controls — it's the
 * same underlying number (days between doses), just labeled either way
 * depending on which side of 1 it falls on.
 */
var FREQ_STEPS = [
  1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 1, 1.5, 2, 3, 4, 5, 7, 10, 14, 21, 30, 45, 60, 90
];

function clampFreqIndex(i) {
  var n = typeof i === 'number' ? i : parseInt(String(i), 10);
  if (!Number.isFinite(n)) n = FREQ_STEPS.indexOf(1);
  return Math.max(0, Math.min(FREQ_STEPS.length - 1, Math.round(n)));
}

function freqIndexToDays(i) {
  return FREQ_STEPS[clampFreqIndex(i)];
}

function nearestFreqIndex(days) {
  var d = Number(days);
  if (!Number.isFinite(d) || d <= 0) d = 1;
  var best = 0;
  var bestDist = Infinity;
  for (var i = 0; i < FREQ_STEPS.length; i++) {
    var dist = Math.abs(Math.log(FREQ_STEPS[i]) - Math.log(d));
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

/* "every 3 days" for day-or-more intervals, "4x a day" for sub-day ones,
 * "once a day" exactly at 1 — the same wording the in-game slider uses. */
function formatFrequency(days) {
  var d = Number(days);
  if (!Number.isFinite(d) || d <= 0) d = 1;
  if (Math.abs(d - 1) < 1e-9) return 'once a day';
  if (d < 1) {
    var perDay = Math.round(1 / d);
    return perDay + 'x a day';
  }
  var days2 = Math.round(d * 10) / 10;
  return 'every ' + (Number.isInteger(days2) ? days2 : days2.toFixed(1)) + ' days';
}

var STACK_COVERAGE_LABELS = {
  gene: 'free from gene',
  'zero-risk': 'safe add-on',
  normal: 'normal risk'
};

function drugById(id) {
  var d = DRUGS.filter(function (x) { return x.id === id; })[0];
  return d || DRUGS[0];
}

function modifierById(id) {
  var m = MODIFIERS.filter(function (x) { return x.id === id; })[0];
  return m || MODIFIERS[0];
}

function traitById(id) {
  var t = TRAITS.filter(function (x) { return x.id === id; })[0];
  return t || TRAITS[0];
}

function drugsForTrait(traitId) {
  var trait = traitById(traitId);
  var ids = trait.drugFilter || ALL_DRUG_IDS;
  return DRUGS.filter(function (d) { return ids.indexOf(d.id) >= 0; });
}

function modifierForTraitDrug(traitId, drugId) {
  var trait = traitById(traitId);
  if (typeof trait.modifierByDrug === 'function') return trait.modifierByDrug(drugId);
  return trait.modifier || 'none';
}

/* Candidate drugs for a trait, hardest-to-overdose first. */
function rankedDrugsForTrait(traitId) {
  return drugsForTrait(traitId).slice().sort(function (a, b) {
    if (a.odChance !== b.odChance) return a.odChance - b.odChance;
    return a.name.localeCompare(b.name);
  });
}

/* The single drug this tool recommends once a trait is picked — no manual
 * drug choice needed. Genes that lock a specific drug win first; otherwise
 * it's whichever candidate is hardest to overdose on. */
function bestDrugForTrait(traitId) {
  var trait = traitById(traitId);
  if (trait.autoDrug) return trait.autoDrug;
  if (trait.primaryDrug) return trait.primaryDrug;
  var ranked = rankedDrugsForTrait(traitId);
  return ranked.length ? ranked[0].id : 'wakeup';
}

function secondaryDrugForTrait(traitId) {
  var trait = traitById(traitId);
  return trait.secondaryDrug || null;
}

/*
 * Can this trait's drugs be safely combined? Only Hussar/Waster actually
 * have genes that zero out overdose for a specific drug ("gene" coverage);
 * everyone else can still freely stack on a naturally 0%-overdose drug
 * like Psychite tea ("zero-risk" coverage) since it carries no extra risk
 * regardless of xenotype — but stacking two drugs with real odChance does
 * NOT cancel either one's individual risk out, so that's flagged too.
 */
function stackForTrait(traitId) {
  var trait = traitById(traitId);
  var rows = (trait.stack || []).map(function (r) {
    return { drugId: r.drug, coverage: r.coverage, note: r.note, cadence: r.cadence || null };
  });
  if (!rows.length) {
    var best = bestDrugForTrait(traitId);
    var bd = drugById(best);
    rows.push({
      drugId: best,
      coverage: bd.odChance === 0 ? 'zero-risk' : 'normal',
      note: bd.odChance === 0
        ? '0% overdose by itself — no special gene needed'
        : 'No protective gene — follow the safe interval above; this drug\'s full risk still applies',
      cadence: null
    });
  }
  if (!rows.some(function (r) { return r.drugId === 'psychitetea'; })) {
    rows.push({
      drugId: 'psychitetea',
      coverage: 'zero-risk',
      note: '0% overdose on its own — can always be added to the mix without raising the other drugs\' overdose risk (its own tolerance/addiction still needs its own safe interval)',
      cadence: null
    });
  }
  return rows.map(function (r) {
    var d = drugById(r.drugId);
    var safeOwn = safeIntervalDays(d);
    var cadence = r.cadence || (d.odChance === 0 && safeOwn != null
      ? formatFrequency(safeOwn)
      : formatFrequency(recommendedIntervalDays(d.id, traitId)));
    return {
      drug: d,
      coverage: r.coverage,
      note: r.note,
      cadence: cadence
    };
  });
}

/* The Frequency (days) that keeps a given drug at its own safe cadence, so
 * the tool opens on a clean "ok" verdict instead of an arbitrary 1/day.
 * Trait-aware: genes that remove all overdose/addiction for the drug
 * (dependency / impervious) have no reason to hold back — daily regimen. */
function recommendedIntervalDays(drugId, traitId) {
  var drug = drugById(drugId);
  if (traitId) {
    var mod = modifierById(modifierForTraitDrug(traitId, drugId));
    if (mod.immune || mod.dependency) return 1;
  }
  var safe = safeIntervalDays(drug);
  return safe || 1;
}

function parseTrait(raw) {
  var id = String(raw == null ? '' : raw);
  var hit = TRAITS.filter(function (t) { return t.id === id; })[0];
  return hit ? hit.id : 'baseliner';
}

function parseDrug(raw, traitId) {
  var id = String(raw == null ? '' : raw);
  var allowed = drugsForTrait(traitId || 'baseliner').map(function (d) { return d.id; });
  if (allowed.indexOf(id) >= 0) return id;
  return bestDrugForTrait(traitId || 'baseliner');
}

function parseIntervalDays(raw) {
  var n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(FREQ_STEPS[0], Math.min(FREQ_STEPS[FREQ_STEPS.length - 1], n));
}

function safeIntervalDays(drug) {
  if (drug.toleranceGain != null && drug.toleranceDecay) {
    return drug.toleranceGain / drug.toleranceDecay;
  }
  if (drug.heuristicSafeDays != null) return drug.heuristicSafeDays;
  return null;
}

function cumulativeOdChance(perDoseChance, doses) {
  if (!perDoseChance) return 0;
  var p = Math.max(0, Math.min(1, perDoseChance));
  return 1 - Math.pow(1 - p, Math.max(0, doses));
}

function verdictFor(pct) {
  if (pct <= 0.03) return { level: 'ok', label: 'Low risk' };
  if (pct <= 0.15) return { level: 'warn', label: 'Medium risk — careful' };
  return { level: 'bad', label: 'High risk — avoid' };
}

function evaluate(input) {
  var traitId = parseTrait(input.trait);
  var trait = traitById(traitId);
  var drugId = parseDrug(input.drug, traitId);
  var drug = drugById(drugId);
  var modId = modifierForTraitDrug(traitId, drugId);
  var mod = modifierById(modId);
  var intervalDays = parseIntervalDays(input.intervalDays);
  var dosesPerDay = 1 / intervalDays;
  var dosesPerWeek = Math.max(1, Math.round(WEEK_DAYS * dosesPerDay));

  var result = {
    trait: trait,
    drug: drug,
    modifier: mod,
    dosesPerDay: dosesPerDay,
    intervalDays: intervalDays,
    dosesPerWeek: dosesPerWeek,
    safeIntervalDays: safeIntervalDays(drug),
    dependency: false,
    odPct: 0,
    addictionRisk: null,
    verdict: { level: 'ok', label: 'Low risk' },
    notes: [],
    overStackWarning: null,
    policyFrequencyDays: Math.round(intervalDays * 100) / 100
  };

  if (drug.minRedoseHours && intervalDays * 24 < drug.minRedoseHours) {
    result.overStackWarning = 'Dosing tighter than the drug lasts (~' + drug.minRedoseHours + ' h) — severity stacks past 100% for nothing; cut doses per day';
  }

  var immune = !!mod.immune;
  var dependency = !!mod.dependency;

  if (dependency) {
    result.dependency = true;
    result.graceDays = DEP_GRACE_DAYS;
    result.comaDays = DEP_COMA_DAYS;
    result.deathDays = DEP_DEATH_DAYS;
    result.recommendedMaxIntervalDays = DEP_SAFE_MARGIN_DAYS;
    result.odPct = 0;
    var okInterval = intervalDays <= DEP_SAFE_MARGIN_DAYS;
    result.verdict = okInterval
      ? { level: 'ok', label: 'Safe — a mandatory need, not an addiction' }
      : { level: 'bad', label: 'Gap too long — withdrawal risk' };
    if (mod.note) result.notes.push(mod.note);
    if (trait.note) result.notes.push(trait.note);
    return result;
  }

  if (immune) {
    result.odPct = 0;
    result.verdict = { level: 'ok', label: 'Safe — this gene blocks both addiction and overdose' };
    if (mod.note) result.notes.push(mod.note);
    if (trait.note) result.notes.push(trait.note);
    return result;
  }

  var consequenceMult = typeof mod.consequenceMult === 'number' ? mod.consequenceMult : 1;
  var riskBump = typeof mod.riskBump === 'number' ? mod.riskBump : 0;

  var odPct = cumulativeOdChance(drug.odChance, dosesPerWeek);
  result.odPct = odPct;

  if (drug.addictChance > 0) {
    result.addictionRisk = {
      chancePerDose: drug.addictChance,
      expectedDoses: Math.ceil(1 / drug.addictChance),
      pct30d: cumulativeOdChance(drug.addictChance, 30 / intervalDays)
    };
    result.notes.push(
      'Addiction chance ' + Math.round(drug.addictChance * 1000) / 10 + '% per dose — at this frequency ~' +
      Math.round(result.addictionRisk.pct30d * 1000) / 10 + '% addicted within 30 days (on average it takes hold at dose ' +
      result.addictionRisk.expectedDoses + '). Once addicted it behaves like a dependency: work is unaffected while stock lasts; the only danger is a dry day hitting withdrawal');
  }

  var effectivePct = odPct * (1 + riskBump * 0.5);
  var verdict = verdictFor(drug.odChance > 0 ? effectivePct : 0);

  if (drug.odChance === 0 && result.safeIntervalDays != null) {
    var tightness = intervalDays > 0 ? result.safeIntervalDays / intervalDays : 99;
    if (tightness <= 1) verdict = { level: 'ok', label: 'Low risk — tolerance recovers in time' };
    else if (tightness <= 1.8) verdict = { level: 'warn', label: 'Tolerance building — space doses further apart' };
    else verdict = { level: 'bad', label: 'Heavy tolerance buildup — addiction/organ damage risk' };
  }

  result.verdict = verdict;
  if (consequenceMult === 0 && drug.odChance > 0) {
    result.notes.push('Gene prevents permanent damage if an overdose happens, but the chance (' + Math.round(odPct * 1000) / 10 + '%/week) is unchanged');
  } else if (consequenceMult && consequenceMult !== 1 && drug.odChance > 0) {
    result.notes.push('Overdose severity x' + consequenceMult + ' of normal if it happens');
  }
  if (modId !== 'none' && mod.note) result.notes.push(mod.note);
  if (trait.note) result.notes.push(trait.note);
  result.notes.push(drug.safetyNote);
  result.notes = result.notes.filter(Boolean);
  return result;
}

function defaultDrugState() {
  var drug = bestDrugForTrait('baseliner');
  return {
    trait: 'baseliner',
    drug: drug,
    intervalDays: recommendedIntervalDays(drug)
  };
}

function parseDrugState(raw) {
  var src = raw && typeof raw === 'object' ? raw : {};
  var trait = parseTrait(src.trait);
  var drug = parseDrug(src.drug, trait);
  var intervalDays = src.intervalDays == null
    ? recommendedIntervalDays(drug, trait)
    : parseIntervalDays(src.intervalDays);
  return {
    trait: trait,
    drug: drug,
    intervalDays: intervalDays
  };
}

var api = {
  DRUGS: DRUGS,
  MODIFIERS: MODIFIERS,
  TRAITS: TRAITS,
  FREQ_STEPS: FREQ_STEPS,
  WEEK_DAYS: WEEK_DAYS,
  DEP_GRACE_DAYS: DEP_GRACE_DAYS,
  DEP_COMA_DAYS: DEP_COMA_DAYS,
  DEP_DEATH_DAYS: DEP_DEATH_DAYS,
  DEP_SAFE_MARGIN_DAYS: DEP_SAFE_MARGIN_DAYS,
  drugById: drugById,
  modifierById: modifierById,
  traitById: traitById,
  drugsForTrait: drugsForTrait,
  rankedDrugsForTrait: rankedDrugsForTrait,
  bestDrugForTrait: bestDrugForTrait,
  secondaryDrugForTrait: secondaryDrugForTrait,
  recommendedIntervalDays: recommendedIntervalDays,
  stackForTrait: stackForTrait,
  STACK_COVERAGE_LABELS: STACK_COVERAGE_LABELS,
  modifierForTraitDrug: modifierForTraitDrug,
  parseTrait: parseTrait,
  parseDrug: parseDrug,
  parseIntervalDays: parseIntervalDays,
  clampFreqIndex: clampFreqIndex,
  freqIndexToDays: freqIndexToDays,
  nearestFreqIndex: nearestFreqIndex,
  formatFrequency: formatFrequency,
  safeIntervalDays: safeIntervalDays,
  cumulativeOdChance: cumulativeOdChance,
  verdictFor: verdictFor,
  evaluate: evaluate,
  defaultDrugState: defaultDrugState,
  parseDrugState: parseDrugState
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.DrugCalc = api;
}
