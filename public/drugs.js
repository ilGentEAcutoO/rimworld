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
    groupLabel: 'ยาเพื่อทำงาน',
    workFocus: true,
    effect: '+50% ความเร็วงาน · +10% consciousness · +10% เดิน · ฟื้น rest ทันที 100% · หลับช้าลง (×80% sleep fall) · +20% psyfocus',
    odChance: 0.005,
    addictChance: 0.02,
    toleranceGain: null,
    toleranceDecay: null,
    heuristicSafeDays: 3,
    minRedoseHours: 12,
    firstRedoseHours: 8,
    safetyNote: 'ฤทธิ์อยู่ ~12 ชม. อย่าแทงซ้ำก่อน 8 ชม. (เข็มแรก) แล้วเว้น 12 ชม.ขึ้นไปหลังจากนั้น — แทงถี่กว่านี้ทำให้ severity ซ้อนเกิน 100% เสียเปล่า ไม่ได้ผลเพิ่ม'
  },
  {
    id: 'gojuice',
    name: 'Go-juice',
    group: 'work',
    groupLabel: 'ยาเพื่อทำงาน',
    workFocus: true,
    effect: '+consciousness · +moving · +sight · ลดเจ็บปวด · +psyfocus · เก็บไว้ใช้รบ/ฉุกเฉินมากกว่าทำงานประจำวัน',
    odChance: 0.005,
    addictChance: 0.026,
    toleranceGain: null,
    toleranceDecay: null,
    heuristicSafeDays: 3,
    minRedoseHours: 16,
    firstRedoseHours: 4.8,
    safetyNote: 'ฤทธิ์อยู่ ~16 ชม. อย่าแทงซ้ำก่อน 4.8 ชม. และเว้น 16 ชม.ขึ้นไปเพื่อไม่ให้เสียเปล่า — ไม่ใช่ยาที่ควรใช้ทำงานทุกวัน เก็บไว้เป็นของฉุกเฉิน'
  },
  {
    id: 'psychitetea',
    name: 'Psychite tea',
    group: 'work',
    groupLabel: 'ยาเพื่อทำงาน',
    workFocus: true,
    effect: '+12 mood · ×80% sleep fall rate (ตื่นได้นานขึ้น) · ×90% pain — ไม่มี overdose เลย ตัวเลือกปลอดภัยสุดถ้าอยากลดง่วง',
    odChance: 0,
    addictChance: 0.02,
    toleranceGain: 0.03,
    toleranceDecay: 0.015,
    safetyNote: 'ไม่มีความเสี่ยง overdose — จำกัดแค่ tolerance/ติดยา ให้กินตามช่วงปลอดภัยด้านล่างพอ'
  },
  {
    id: 'yayo',
    name: 'Yayo',
    group: 'psychoid',
    groupLabel: 'ไซคอยต์ดิบ/แปรรูป',
    workFocus: false,
    effect: '+35 mood · ลดเจ็บปวด · เดินดีขึ้น · ลดความต้องการนอนเล็กน้อย',
    odChance: 0.01,
    addictChance: 0.01,
    toleranceGain: 0.04,
    toleranceDecay: 0.015,
    safetyNote: 'tolerance เกิน 45% เสี่ยงไตเสียหายถาวร — อย่ากินถี่กว่าช่วงปลอดภัยด้านล่าง'
  },
  {
    id: 'flake',
    name: 'Flake',
    group: 'psychoid',
    groupLabel: 'ไซคอยต์ดิบ/แปรรูป',
    workFocus: false,
    effect: '+35 mood · ลดเจ็บปวด · เดินดีขึ้น — ถูก/ผลิตง่ายกว่า yayo แต่ติดง่ายกว่ามาก',
    odChance: 0.015,
    addictChance: 0.05,
    toleranceGain: 0.04,
    toleranceDecay: 0.015,
    safetyNote: 'โอกาสติดยา 5% ต่อโดสสูงสุดในกลุ่มนี้ — แนะนำเลี่ยงใช้ประจำ เก็บไว้ขาย/กรณีจำเป็นจริง ๆ'
  },
];

/*
 * Only the 5 drugs relevant to "work harder / sleep less" builds are kept
 * here on purpose (no Smokeleaf/Beer/Ambrosia/Luciferium/Painkiller) — the
 * tool auto-picks from this short list so there's nothing extra to weigh.
 */

var ALL_DRUG_IDS = DRUGS.map(function (d) { return d.id; });

var MODIFIERS = [
  { id: 'none', name: 'ไม่มี (Baseliner ปกติ)' },
  {
    id: 'chemFascination',
    name: 'Trait: Chemical fascination',
    note: 'ไม่ได้ลดโอกาส overdose — กลับเพิ่มความเสี่ยงเพราะตัวละครจะแอบใช้ยาเองบ่อยกว่าที่ตั้งไว้ (เมิน "ห้ามใช้เพื่อสันทนาการ" เสมอ) คุมด้วยนโยบายอย่างเดียวไม่พอ ต้องเผื่อสต๊อกและใจกว้างเรื่อง mood swing',
    riskBump: 1
  },
  {
    id: 'chemInterest',
    name: 'Trait: Chemical interest',
    note: 'เหมือน Chemical fascination แต่เบากว่า — ยังแอบใช้ยาเองได้เมื่อ mood ต่ำ เผื่อสต๊อกไว้บ้าง',
    riskBump: 0.5
  },
  {
    id: 'chemDamageNone',
    name: 'Gene: Chemical damage — none',
    note: 'ถ้า overdose เกิดขึ้นจริง จะไม่มีความเสียหายอวัยวะถาวร/ตาย — แต่ตัว "โอกาสเกิด overdose" ต่อโดสยังเท่าเดิม ยังเสียเวลา/mood อยู่ดี',
    consequenceMult: 0
  },
  {
    id: 'chemDamageReduced',
    name: 'Gene: Chemical damage — reduced',
    note: 'ความเสียหายจาก overdose เบาลงถ้าเกิดขึ้น แต่โอกาสเกิดยังเท่าเดิม',
    consequenceMult: 0.5
  },
  {
    id: 'chemDamageIncreased',
    name: 'Gene: Chemical damage — increased',
    note: 'ความเสียหายจาก overdose รุนแรงกว่าปกติถ้าเกิดขึ้น — ควรเผื่อ margin เพิ่ม ยืดช่วงกินให้ห่างกว่าค่าที่คำนวณ',
    consequenceMult: 2,
    riskBump: 1
  },
  {
    id: 'wakeupImpervious',
    name: 'Gene: Wake-up impervious',
    note: 'ภูมิคุ้มกันทั้งการติดยาและ overdose (ทั้งแบบสุ่มและแบบสะสม) จาก Wake-up โดยเฉพาะ — ใช้ถี่แค่ไหนก็ได้ จำกัดแค่เรื่องฤทธิ์ซ้อนเสียเปล่า ยีนนี้ไม่ครอบคลุม flake/yayo/go-juice ข้อควรรู้เดียวที่ยีนไม่ช่วย: wake-up มีโอกาสหัวใจวายหายากระหว่างฤทธิ์ (ใครก็เจอได้) — ใส่หัวใจ prosthetic/bionic แล้วป้องกันได้ 100%',
    immune: true
  },
  {
    id: 'gojuiceDependency',
    name: 'Gene: Go-juice dependency',
    note: 'ยีน dependency ตัดทิ้งทั้งโอกาส overdose แบบสุ่มและการติดของ Go-juice — ฉีดไม่จำกัดไม่มีผลข้างเคียงสุขภาพเลย แถม +4 metabolic efficiency เหลือภาระเดียวคือต้องได้รับสม่ำเสมอ: เว้นเกิน ~5 วันเริ่ม mood drop, ~30 วันเข้าโคม่า, ~60 วันตาย',
    dependency: true
  },
  {
    id: 'psychiteDependency',
    name: 'Gene: Psychite dependency',
    note: 'ยีน dependency กันทั้ง overdose (สุ่ม+สะสม) และการติดของไซคอยต์ทุกรูปแบบ tea/yayo/flake — ตัวไหนก้อนไหนก็เติม need ได้หมด เหลือภาระต้องกินสม่ำเสมอ (เว้น >5 วันเริ่ม mood drop, ~30 วันโคม่า, ~60 วันตาย) สุขภาพที่ยีนไม่คุ้มคือ tolerance: กินถี่มาก (~11 โดสติดกัน) ถึงจะเด้งไต — เว้นช่วง ≥5 วัน/โดส ไตปลอดภัยตลอดไป',
    dependency: true
  },
  {
    id: 'genericDependency',
    name: 'Gene: [ยานี้] dependency (custom xenotype)',
    note: 'ยีน dependency แบบกำหนดเองต่อยา (จาก gene editor) — กลไกเดียวกับ Hussar/Waster: ภูมิคุ้มกัน overdose/ติดยาปกติของยานี้ แลกกับต้องได้รับสม่ำเสมอ',
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
    name: 'ไม่มี / Baseliner ปกติ',
    drugFilter: null,
    modifier: 'none',
    note: 'มนุษย์ปกติไม่มียีน/trait พิเศษด้านเคมี — ใช้ตัวเลขพื้นฐานของยาตามตาราง'
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
    note: 'ปกติจะไม่ยอมกินยาเพื่อสันทนาการเอง — ใช้เครื่องคิดนี้เฉพาะช่วงที่เราสั่งให้กินเพื่อทำงาน/รักษา ค่าอื่นเป็นค่าพื้นฐานปกติ'
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
    note: 'Hussar ผูกกับ Go-juice dependency ตั้งแต่เกิด — ฉีด Go-juice ได้ไม่จำกัด ไม่มี overdose (แม้แบบสุ่ม) ไม่มีการติด ไม่มีผลสุขภาพ ยาอื่น ๆ ที่ยีนไม่กระทบใช้ค่าพื้นฐานปกติ',
    stack: [
      { drug: 'gojuice', coverage: 'gene', cadence: 'วันละ 1 เข็ม', note: 'ฟรีจากยีนโดยตรง — ฤทธิ์ ~16 ชม. เข็มเดียวคุบทั้งวันทำงาน ใช้เพิ่มตอนรบได้สบายไม่มีโทษ' }
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
    note: 'Waster = Wake-up impervious + Psychite dependency — ผสมยาได้คุ้มสุดในเกม: Wake-up แทงไม่จำกัดไม่มี OD/ติด (เหลือแค่โอกาสหัวใจวายหายาก) และไซคอยต์ก้อนไหนก็กินได้อิสระไม่มี OD/ติด แค่ต้องกินสม่ำเสมอเพื่อเลี้ยง dependency',
    stack: [
      { drug: 'wakeup', coverage: 'gene', cadence: 'วันละ 1 เข็ม', note: 'ฟรีจากยีน impervious — ฤทธิ์ ~12 ชม. แทงตอนเช้าคุบงานทั้งวัน อย่าแทงถี่กว่า 8 ชม. ฤทธิ์จะซ้อนเสียเปล่า' },
      { drug: 'psychitetea', coverage: 'gene', cadence: 'ทุก 2–5 วัน', note: 'เลี้ยง Psychite dependency ตรง ๆ — tea กินได้ทุก 2 วันไม่สะสม tolerance, สลับ flake (ทุก 2.7 วัน) ถูกกว่า/เวิร์คกว่าต่อใบ psychoid, yayo แรงสุด ไม่ว่าก้อนไหนเว้น ≤5 วัน/โดสไตปลอดภัยตลอด' }
    ]
  },
  {
    id: 'customDependency',
    name: 'Gene: [ยานี้] dependency (custom xenotype)',
    drugFilter: ['wakeup', 'gojuice', 'yayo', 'flake', 'psychitetea'],
    primaryDrug: 'wakeup',
    modifier: 'genericDependency',
    note: 'ตัวอย่างใช้ Wake-up — ถ้ายีนกำหนดเองของคุณผูกกับยาตัวอื่นในกลุ่มนี้ กลไกคำนวณเดียวกันทุกประการ แค่เปลี่ยนชื่อยา'
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

/* "ทุก 3 วัน" for day-or-more intervals, "วันละ 4 ครั้ง" for sub-day ones,
 * "วันละครั้ง" exactly at 1 — the same wording the in-game slider uses. */
function formatFrequency(days) {
  var d = Number(days);
  if (!Number.isFinite(d) || d <= 0) d = 1;
  if (Math.abs(d - 1) < 1e-9) return 'วันละครั้ง';
  if (d < 1) {
    var perDay = Math.round(1 / d);
    return 'วันละ ' + perDay + ' ครั้ง';
  }
  var days2 = Math.round(d * 10) / 10;
  return 'ทุก ' + (Number.isInteger(days2) ? days2 : days2.toFixed(1)) + ' วัน';
}

var STACK_COVERAGE_LABELS = {
  gene: 'ฟรีจากยีน',
  'zero-risk': 'ปลอดภัยเสริม',
  normal: 'ความเสี่ยงปกติ'
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
        ? 'overdose 0% โดยตัวมันเองอยู่แล้ว ไม่ต้องพึ่งยีนพิเศษ'
        : 'ไม่มียีนพิเศษคุ้มครอง — ใช้ตามช่วงปลอดภัยด้านบน ความเสี่ยงยังเป็นของยานี้เต็ม ๆ',
      cadence: null
    });
  }
  if (!rows.some(function (r) { return r.drugId === 'psychitetea'; })) {
    rows.push({
      drugId: 'psychitetea',
      coverage: 'zero-risk',
      note: 'overdose 0% ด้วยตัวเอง เติมเข้าไปในสูตรได้เสมอโดยไม่เพิ่มความเสี่ยง overdose ของยาตัวอื่น (ยังมี tolerance/ติดยาของมันเองให้คุมแยกตามช่วงปลอดภัยของมัน)',
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
  if (pct <= 0.03) return { level: 'ok', label: 'เสี่ยงต่ำ' };
  if (pct <= 0.15) return { level: 'warn', label: 'เสี่ยงปานกลาง — ระวัง' };
  return { level: 'bad', label: 'เสี่ยงสูง — ควรเลี่ยง' };
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
    verdict: { level: 'ok', label: 'เสี่ยงต่ำ' },
    notes: [],
    overStackWarning: null,
    policyFrequencyDays: Math.round(intervalDays * 100) / 100
  };

  if (drug.minRedoseHours && intervalDays * 24 < drug.minRedoseHours) {
    result.overStackWarning = 'ให้ถี่กว่าที่ยาออกฤทธิ์อยู่ (~' + drug.minRedoseHours + ' ชม.) — severity จะซ้อนเกิน 100% เสียเปล่า ไม่ได้ผลเพิ่มจริง ลดจำนวนครั้ง/วันลง';
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
      ? { level: 'ok', label: 'ปลอดภัย — เป็นความต้องการบังคับ ไม่ใช่การติดยา' }
      : { level: 'bad', label: 'ช่วงห่างเกินไป เสี่ยงเข้าสู่อาการขาดยา' };
    if (mod.note) result.notes.push(mod.note);
    if (trait.note) result.notes.push(trait.note);
    return result;
  }

  if (immune) {
    result.odPct = 0;
    result.verdict = { level: 'ok', label: 'ปลอดภัย — ยีนนี้กันทั้งติดยาและ overdose' };
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
      'โอกาสติด ' + Math.round(drug.addictChance * 1000) / 10 + '%/โดส — ณ ความถี่นี้ ~' +
      Math.round(result.addictionRisk.pct30d * 1000) / 10 + '% ติดภายใน 30 วัน (เฉลี่ยโดสที่ ' +
      result.addictionRisk.expectedDoses + ' จึงตั้งไข่) พอติด = กลายเป็นความต้องการบังคับแบบ dependency: สต๊อกไม่ขาดก็งานไม่กระทบ อันตรายเดียวคือวันที่ยาหมดแล้วเจอ withdrawal');
  }

  var effectivePct = odPct * (1 + riskBump * 0.5);
  var verdict = verdictFor(drug.odChance > 0 ? effectivePct : 0);

  if (drug.odChance === 0 && result.safeIntervalDays != null) {
    var tightness = intervalDays > 0 ? result.safeIntervalDays / intervalDays : 99;
    if (tightness <= 1) verdict = { level: 'ok', label: 'เสี่ยงต่ำ — tolerance คืนตัวทัน' };
    else if (tightness <= 1.8) verdict = { level: 'warn', label: 'tolerance เริ่มสะสม — เว้นให้ห่างขึ้น' };
    else verdict = { level: 'bad', label: 'tolerance สะสมมาก — เสี่ยงติดยา/อวัยวะเสีย' };
  }

  result.verdict = verdict;
  if (consequenceMult === 0 && drug.odChance > 0) {
    result.notes.push('ยีนกันความเสียหายถาวรถ้า overdose เกิดขึ้นจริง แต่โอกาสเกิด (' + Math.round(odPct * 1000) / 10 + '%/สัปดาห์) ยังเท่าเดิม');
  } else if (consequenceMult && consequenceMult !== 1 && drug.odChance > 0) {
    result.notes.push('ความรุนแรงถ้า overdose เกิดขึ้นจริงคูณ ' + consequenceMult + '× จากปกติ');
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
