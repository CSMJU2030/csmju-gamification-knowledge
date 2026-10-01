#!/usr/bin/env node
/**
 * progsearch — ค้นหาโปรแกรมที่ดีที่สุดจริงของแต่ละอาชีพ (รอบ 2S — docs/design-round2s.md)
 *
 * ทำไมต้องค้น ไม่ใช่เดา: รอบ 2L พบว่าโปรแกรม "คนคิดเป็น" ที่ใช้จูนเกมมาตั้งแต่รอบ 2P เป็นแค่ระดับกลาง
 * และโปรแกรมผู้พิทักษ์ที่ PM เดาไว้ แพ้คนบรรทัดเดียวทุกชั้น — เราจูนเกมเทียบกับการเดามาตลอด
 *
 * ตัวชี้วัด (§2): "เลเวลขั้นต่ำ" = เลเวลต่ำสุดที่โปรแกรมชนะ ≥ PASS
 *   ค่าของโค้ด = เลเวลขั้นต่ำ(บรรทัดเดียวที่ดีที่สุด) − เลเวลขั้นต่ำ(ที่ดีที่สุด)
 *   = "โค้ดนี้ประหยัดเลเวลให้คุณกี่เลเวล" ซึ่งคือคำสัญญาของเกมพอดี
 *
 * กติกาที่มาจากความผิดพลาดรอบก่อน (§3):
 *   1. วัดราย (ภูมิภาค × รอบ) ห้ามเฉลี่ยรวมชั้น — รอบ 2L ภูเขาไฟจมอยู่ในค่าเฉลี่ย
 *   2. ของแบบผู้เล่นจริง — ดรอปที่ชั้นนั้น uncommon ไม่อัปเกรด อัฟฟิกซ์เดียว
 *   3. โปรแกรมต้องผ่าน validator ตัวจริง ด้วยความสามารถที่ปลดแล้วตอนมาถึงครั้งแรก
 *      และสกิลที่มีจริงที่เลเวลนั้น (cast สกิลที่ยังไม่มี = บันทึกไม่ได้ = ไม่ผ่าน)
 *   4. บิลด์เดียวกันทุกโปรแกรมในอาชีพเดียวกัน — ต่างกันแค่โค้ด
 *
 * ข้อจำกัดที่ต้องรู้ (รายงานตรง ๆ): if/elif/else ไม่ได้ค้นเต็มพื้นที่ (แพงเกิน) — ต่อยอดจากตัวดีที่สุดของ if/else
 * และ **ไม่มี for · ตัวแปร · and/or · turn_no** — เกณฑ์ S2 พิสูจน์แล้วว่าจอมเวทมีโปรแกรม for ที่ประหยัด +2
 * ที่ภูเขาไฟรอบ 4-5 ซึ่งเครื่องมือนี้เขียนไม่ได้ ผลของจอมเวทจากที่นี่จึง **ต่ำกว่าความจริง**
 * ผลการทดสอบแบบพยายามล้มเต็ม ๆ อยู่ที่ docs/playtest/s2-adversarial.md
 *
 *   npm run build -w engine && CLASS=warrior node engine/tools/progsearch.cjs
 *   ผลเต็มเขียนลง docs/measurements/progsearch-<class>.json
 */
const fs = require('fs');
const path = require('path');
const E = require('../dist/src/index.js');

const CLASS = process.env.CLASS || 'warrior';
const PASS = 0.8;
const MAXLV = Number(process.env.MAXLV || 40);
const SEEDS_SCREEN = Number(process.env.SEEDS_SCREEN || 6);
const SEEDS_FULL = Number(process.env.SEEDS_FULL || 64); // 24 แกว่ง ±1 เลเวล (เกณฑ์ S2 วัดได้)
const TOP_IFELSE = Number(process.env.TOP_IFELSE || 15);
const TOP_EXTEND = Number(process.env.TOP_EXTEND || 8);
const HERO_ID = 'p1';

// ------------------------------------------------------------------ ตัวละครและของ

/** สัดส่วนแต้มตามธรรมชาติของอาชีพ — ใช้กับทุกโปรแกรมเท่ากัน (กติกา 4) */
const SHAPE = {
  warrior: { str: 0.6, vit: 0.25, agi: 0.08, luk: 0.07 },
  mage: { int: 0.6, vit: 0.25, agi: 0.08, luk: 0.07 },
  guardian: { vit: 0.6, str: 0.25, agi: 0.08, luk: 0.07 },
};

function statsAt(level) {
  const base = E.gamedata.classes[CLASS].baseStats;
  const pts = (level - 1) * 5;
  const out = { ...base };
  let used = 0;
  const entries = Object.entries(SHAPE[CLASS]);
  for (const [k, share] of entries.slice(1)) { const v = Math.floor(pts * share); out[k] += v; used += v; }
  out[entries[0][0]] += pts - used; // เศษทั้งหมดไปสายหลัก
  return out;
}

/** ของแบบผู้เล่นจริงที่ชั้น f (กติกา 2) — ไม่ใช่ epic +15 ในอุดมคติแบบ syncprobe */
function gearAt(floor) {
  const mage = CLASS === 'mage';
  const mk = (slot, baseId, affix) => ({
    id: `g_${slot}`, baseId, slot, rarity: 'uncommon', upgradeLevel: 0,
    droppedFloor: floor, affixes: [affix],
  });
  return [
    mk('weapon', mage ? 'staff' : 'sword', { stat: mage ? 'matk_pct' : 'atk_pct', value: 10 }),
    mk('armor', 'plate', { stat: 'hp_pct', value: 8 }),
    mk('helmet', 'helm', { stat: 'def_pct', value: 8 }),
    mk('accessory', mage ? 'amulet' : 'ring', { stat: 'crit_rate', value: 4 }),
  ];
}

const skillsAt = (level) => E.gamedata.skills
  .filter((s) => s.classId === CLASS && s.unlockLevel <= level).map((s) => s.id);

function hero(level, floor, src) {
  const stats = statsAt(level);
  const equipment = gearAt(floor);
  return {
    id: HERO_ID, name: 'search', side: 'party', classId: CLASS, level, stats,
    derived: E.buildDerivedStats(CLASS, level, stats, equipment),
    skills: skillsAt(level), rules: [], equipment, programSource: src,
  };
}

// ------------------------------------------------------------------ พื้นที่ค้น

const SEL = ['weakest', 'strongest', 'deadliest', 'fastest'];
const classSkills = E.gamedata.skills.filter((s) => s.classId === CLASS);
const nameOf = (s) => E.preferredSkillName(s.id);

/** ทุกการกระทำของอาชีพนี้ — รูปการเล็งตามชนิดของสกิล */
const ACTIONS = [
  ...SEL.map((s) => `attack(${s}(enemies))`),
  'defend()',
  ...classSkills.flatMap((s) => {
    if (s.kind === 'heal' || s.kind === 'shield') return [`cast("${nameOf(s)}", me)`];
    if (s.aoe) return [`cast("${nameOf(s)}", enemies)`];
    return SEL.map((t) => `cast("${nameOf(s)}", ${t}(enemies))`);
  }),
];

const CONDS = [
  'count(enemies) >= 2', 'count(enemies) >= 3', 'count(enemies) >= 4', 'count(enemies) == 1',
  'me.hp_pct < 30', 'me.hp_pct < 50', 'me.hp_pct < 70',
  'me.mp_pct >= 50',
  'weakest(enemies).hp_pct < 30', 'weakest(enemies).hp_pct < 50',
  ...classSkills.map((s) => `can_cast("${nameOf(s)}")`),
  // รอบ 2M: สถานะร้ายตัวแรกของเกม — ต้องอยู่ในพื้นที่ค้นตั้งแต่ก่อนสร้างกลไก
  // ไม่งั้นเครื่องมือจะมองไม่เห็นสิ่งที่กลไกให้รางวัล (บทเรียนเดียวกับบั๊กคัดกรองของรอบ 2S)
  ...E.DEBUFF_NAMES.map((d) => `has_debuff("${d}")`),
];

const one = (a) => `def turn():\n    ${a}\n`;
const ifElse = (c, a, b) => `def turn():\n    if ${c}:\n        ${a}\n    else:\n        ${b}\n`;
const ifElifElse = (c1, a, c2, b, d) =>
  `def turn():\n    if ${c1}:\n        ${a}\n    elif ${c2}:\n        ${b}\n    else:\n        ${d}\n`;

// ------------------------------------------------------------------ การวัด

/** ทุกช่อง (ภูมิภาค × รอบ) ที่ต้องวัด — ไม่รวมหอคอย (ทางพลัง ไม่ใช่หลักสูตร · รอบ 2L §2) */
/** REGIONS=frostland,ruins → วัดเฉพาะโซนเหล่านี้ (รอบ 2M วัดก่อน/หลังเฉพาะโซนที่แก้ + โซนควบคุม) */
const ONLY = process.env.REGIONS ? process.env.REGIONS.split(',') : null;
/** TAG → เขียนผลเป็น progsearch-<class>-<tag>.json ไม่ทับผลเต็มที่ EVAL_FILE ใช้อ้างอิง */
const TAG = process.env.TAG || '';
const CELLS = E.listRegions()
  .filter((r) => r.id !== 'tower' && r.depths > 0 && (!ONLY || ONLY.includes(r.id)))
  .flatMap((r) => Array.from({ length: r.depths }, (_, i) => ({
    region: r.id, depth: i + 1, floor: r.floorBase + i,
  })));

/** ตรวจด้วย validator ตัวจริง — แคชตาม (โปรแกรม · ความสามารถ · สกิล) เพราะเรียกซ้ำเป็นหมื่นครั้ง */
const validCache = new Map();
function isValid(src, floor, level) {
  const feats = E.unlockedFeatures(Math.max(0, floor - 1)); // ตอนมาถึงช่องนี้ครั้งแรก (กติกา 3)
  const skills = skillsAt(level);
  const key = `${src}|${[...feats].sort().join(',')}|${skills.join(',')}`;
  let ok = validCache.get(key);
  if (ok === undefined) {
    const p = E.parse(src);
    ok = !p.errors?.length && !!p.program
      && E.validate(p.program, { features: feats, availableSkills: skills }).errors.length === 0;
    validCache.set(key, ok);
  }
  return ok;
}

let battles = 0;
function winRate(src, cell, level, seeds) {
  if (!isValid(src, cell.floor, level)) return 0;
  let wins = 0;
  for (let s = 0; s < seeds; s++) {
    const seed = (cell.floor * 7919 + cell.depth * 131 + s * 104729 + level * 31) >>> 0;
    const entry = E.enterRegion(cell.region, cell.depth, 1, seed);
    const rng = E.mulberry32(E.hashSeed(seed, entry.floor * 977, 1, 0xba771e));
    const r = E.simulateWaves([hero(level, cell.floor, src)], entry.waves,
      { floor: entry.floor, seed, rng });
    battles++;
    if (r.victory) wins++;
  }
  return wins / seeds;
}

/** เลเวลต่ำสุดที่ชนะ ≥ PASS — ค้นแบบไบนารี (อัตราชนะโตตามเลเวลโดยประมาณ) · Infinity = ไม่ถึงแม้ MAXLV */
function minLevel(src, cell, seeds = SEEDS_FULL) {
  if (winRate(src, cell, MAXLV, seeds) < PASS) return Infinity;
  let lo = 1, hi = MAXLV;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (winRate(src, cell, mid, seeds) >= PASS) hi = mid; else lo = mid + 1;
  }
  return lo;
}

/**
 * โปรไฟล์ของโปรแกรม: เลเวลขั้นต่ำต่อช่อง · `null` = **ช่องนี้ยังเขียนโปรแกรมนี้ไม่ได้**
 * (เช่น ป่าเริ่มต้นรอบ 1 อยู่ชั้น 1 ยังไม่ปลด `if` · ชั้น 2 ยังไม่ปลด `cast("…")`)
 *
 * แยก null ออกจาก Infinity โดยตั้งใจ — ครั้งแรกที่รันเครื่องมือนี้ PM นับ "เขียนไม่ได้" เป็นแพ้ +50
 * ผลคือห้าอันดับแรกเป็นบรรทัดเดียวทั้งหมด ทั้งที่ภูเขาไฟมีโปรแกรมที่ประหยัดได้ 8 เลเวล
 * เพราะโปรแกรมที่มี `if` โดนปรับที่ป่าเริ่มต้นทุกตัว — การให้คะแนนบิดผลทั้งตาราง
 */
function profile(src) {
  const topLv = MAXLV;
  return CELLS.map((c) => (isValid(src, c.floor, topLv) ? minLevel(src, c) : null));
}
/** เลเวลขั้นต่ำของบรรทัดเดียวที่ดีที่สุดต่อช่อง — ใช้แทนช่องที่ยังเขียนโปรแกรมนั้นไม่ได้ */
let FALLBACK = null;
const val = (v, i) => (v === null ? (FALLBACK ? FALLBACK[i] : MAXLV + 10) : v);
/**
 * คะแนนรวม = ผลรวมเลเวลขั้นต่ำ · ช่องที่ยังเขียนไม่ได้ใช้ค่าของบรรทัดเดียวที่ดีที่สุด
 * = แบบจำลองของผู้เล่นจริง: "ที่ไหนยังเขียนโปรแกรมนี้ไม่ได้ ก็เขียนบรรทัดเดียวไปก่อน"
 * ช่องที่ไม่ผ่านแม้ MAXLV นับ MAXLV+10 · ต่ำ = ดี
 */
const total = (prof) => prof.reduce((a, v, i) => {
  const x = val(v, i);
  return a + (Number.isFinite(x) ? x : MAXLV + 10);
}, 0);

/**
 * ตรวจตัวเอง: ทุกชิ้นในพื้นที่ค้นต้อง "เขียนได้จริง" ตอนที่ปลดทุกอย่างแล้ว
 * ถ้าชิ้นไหนถูก validator ปฏิเสธ การค้นจะข้ามทั้งกิ่งไปเงียบ ๆ โดยไม่มีใครรู้ว่าพื้นที่หายไปครึ่งหนึ่ง
 * รันเองทุกครั้งก่อนค้น และรันแยกได้ด้วย CHECK_ATOMS=1
 */
{
  const topFloor = Math.max(...CELLS.map((c) => c.floor));
  const badA = ACTIONS.filter((a) => !isValid(one(a), topFloor, MAXLV));
  const badC = CONDS.filter((c) => !isValid(ifElse(c, 'defend()', 'attack(weakest(enemies))'), topFloor, MAXLV));
  if (badA.length || badC.length || process.env.CHECK_ATOMS === '1') {
    console.log(`[ตรวจพื้นที่ค้น ${CLASS}] การกระทำ ${ACTIONS.length} ถูกปฏิเสธ ${JSON.stringify(badA)}`
      + ` · เงื่อนไข ${CONDS.length} ถูกปฏิเสธ ${JSON.stringify(badC)}`);
  }
  if (badA.length || badC.length) { console.log('พื้นที่ค้นมีชิ้นที่เขียนไม่ได้ — หยุดก่อนจะวัดของที่ไม่มีอยู่จริง'); process.exit(1); }
  if (process.env.CHECK_ATOMS === '1') process.exit(0);
}

/**
 * โหมดวัดโปรแกรมเดี่ยว (เกณฑ์ S2): EVAL_FILE=โปรแกรม.py CLASS=… node progsearch.cjs
 * เทียบกับ "บรรทัดเดียวที่ดีที่สุดต่อช่อง" จากผลการค้นที่บันทึกไว้ — ไม่ต้องค้นใหม่ทั้งหมด
 * มีไว้ให้คนที่พยายามล้มผลการค้น วัดโปรแกรมที่เขียนเองด้วยกติกาเดียวกันเป๊ะ
 */
if (process.env.EVAL_FILE) {
  const src = fs.readFileSync(process.env.EVAL_FILE, 'utf8');
  const saved = JSON.parse(fs.readFileSync(
    path.join(__dirname, `../../docs/measurements/progsearch-${CLASS}.json`), 'utf8'));
  const p = E.parse(src);
  if (p.errors?.length || !p.program) { console.log('parse error:', JSON.stringify(p.errors)); process.exit(1); }
  const errs = E.validate(p.program, { features: E.unlockedFeatures(10), availableSkills: skillsAt(MAXLV) }).errors;
  if (errs.length) { console.log('ไม่ผ่าน validator:', errs.map((e) => e.messageTh).join(' | ')); process.exit(1); }
  let better = 0, worse = 0, sumGain = 0;
  console.log(`[${CLASS}] ช่อง            ชั้น | บรรทัดเดียวดีสุด  โปรแกรมนี้  ประหยัด`);
  CELLS.forEach((c, i) => {
    const ref = saved.cells[i].bestOneLine;
    const mine = isValid(src, c.floor, MAXLV) ? minLevel(src, c) : null;
    const gain = mine === null || ref === null ? null : ref - mine;
    if (gain !== null) { sumGain += gain; if (gain > 0) better++; if (gain < 0) worse++; }
    console.log(`  ${(c.region + ' d' + c.depth).padEnd(15)} ${String(c.floor).padStart(3)} |`
      + `  ${String(ref ?? '∞').padStart(6)}            ${String(mine ?? 'เขียนไม่ได้').padStart(6)}   ${gain === null ? '-' : (gain > 0 ? '+' : '') + gain}`);
  });
  console.log(`รวม: ดีกว่า ${better} ช่อง · แย่กว่า ${worse} ช่อง · ประหยัดรวม ${sumGain} เลเวล · ${battles.toLocaleString()} การรบ`);
  process.exit(0);
}

// ------------------------------------------------------------------ ค้น

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`);
log(`${CLASS} · การกระทำ ${ACTIONS.length} · เงื่อนไข ${CONDS.length} · ช่องที่วัด ${CELLS.length}`);

// A) บรรทัดเดียวทุกแบบ — วัดเต็ม
const results = new Map(); // src → profile
for (const a of ACTIONS) results.set(one(a), profile(one(a)));
FALLBACK = CELLS.map((_, i) => Math.min(...[...results.values()]
  .map((prof) => prof[i]).filter((v) => v !== null)));
const oneLiners = [...results.entries()].sort((x, y) => total(x[1]) - total(y[1]));
const BEST_ONE = oneLiners[0][0];
const NAIVE = one('attack(weakest(enemies))');
log(`A) บรรทัดเดียว ${ACTIONS.length} แบบ · ดีที่สุด: ${BEST_ONE.split('\n')[1].trim()}`);

// B) คัดกรอง if/else ทุกแบบ ที่เลเวลที่บรรทัดเดียวที่ดีที่สุดเริ่มแพ้ (ให้ตัวที่ดีกว่าโผล่ให้เห็น)
const bestOneProf = results.get(BEST_ONE);
const screenCells = CELLS.map((c, i) => ({ ...c, lv: Math.max(1, Math.min(MAXLV,
  (Number.isFinite(FALLBACK[i]) ? FALLBACK[i] : MAXLV) - 2)) }))
  .filter((c, i, arr) => ONLY || c.region === 'volcano' || c.region === 'ruins'
    || i === arr.length - 1 || arr[i + 1].region !== c.region);
/**
 * คะแนนคัดกรอง = เลเวลขั้นต่ำแบบประหยัด (seed น้อย) บนช่องตัวแทน — ตัวชี้วัดเดียวกับผลจริง · สูง = ดี
 *
 * **แก้ 23 ก.ย. 2026 หลังเกณฑ์ S2 ล้มผลรอบแรก** — ของเดิมวัด "อัตราชนะที่เลเวลต่ำกว่าบรรทัดเดียว 2 ขั้น"
 * ซึ่งพังสองทาง: (1) ที่เลเวลนั้นสกิลที่ปลดช้ายังบันทึกไม่ได้ (barrier lv6 · heal lv7 · execute lv10)
 * ทุกโปรแกรมที่ใช้สกิลพวกนี้ได้ 0 แล้วตกรอบหมด — โปรแกรมผู้พิทักษ์ที่ประหยัดได้ +2 อยู่อันดับ 814 จาก 1,430
 * (2) ช่องตัวแทนส่วนใหญ่อยู่เลเวล 1 ที่อะไรก็ชนะ "15 ตัวเต็ง" จึงเป็นแค่ชิ้นหนึ่งของกลุ่มที่เสมอกันก้อนใหญ่
 * สกิลที่มีค่าขึ้นกับสถานการณ์ = สกิลที่ทำให้ตรรกะมีค่า เครื่องมือเดิมจึงมองไม่เห็นสิ่งที่มันถูกสร้างมาหาพอดี
 */
const screen = (src) => screenCells.reduce((a, c) => {
  const lv = isValid(src, c.floor, MAXLV) ? minLevel(src, c, SEEDS_SCREEN) : null;
  const x = lv === null ? FALLBACK[CELLS.findIndex((k) => k.region === c.region && k.depth === c.depth)] : lv;
  return a - (Number.isFinite(x) ? x : MAXLV + 10);
}, 0);

const ifElseProgs = [];
for (const c of CONDS) for (const a of ACTIONS) for (const b of ACTIONS) {
  if (a !== b) ifElseProgs.push(ifElse(c, a, b));
}
const screened = ifElseProgs.map((p) => [p, screen(p)]).sort((x, y) => y[1] - x[1]);
log(`B) คัด if/else ${ifElseProgs.length} แบบ บน ${screenCells.length} ช่องตัวแทน`);

// C) ตัวเต็งของ if/else — วัดเต็ม
for (const [p] of screened.slice(0, TOP_IFELSE)) if (!results.has(p)) results.set(p, profile(p));
log(`C) วัดเต็ม if/else ${TOP_IFELSE} ตัวเต็ง`);

// D) ต่อยอดเป็น if/elif/else จากตัวดีที่สุด — แทรก elif หนึ่งกิ่งก่อน else
const ranked = () => [...results.entries()].sort((x, y) => total(x[1]) - total(y[1]));
const seeds = ranked().filter(([p]) => p.includes('    else:')).slice(0, TOP_EXTEND);
const extended = [];
for (const [p] of seeds) {
  const m = p.match(/if (.+):\n {8}(.+)\n {4}else:\n {8}(.+)\n/);
  if (!m) continue;
  const [, c1, a, d] = m;
  for (const c2 of CONDS) for (const b of ACTIONS) {
    if (c2 !== c1 && b !== a && b !== d) extended.push(ifElifElse(c1, a, c2, b, d));
  }
}
const screenedExt = extended.map((p) => [p, screen(p)]).sort((x, y) => y[1] - x[1]);
for (const [p] of screenedExt.slice(0, TOP_IFELSE)) if (!results.has(p)) results.set(p, profile(p));
log(`D) ต่อยอด elif ${extended.length} แบบ · วัดเต็ม ${TOP_IFELSE} ตัวเต็ง`);

// ------------------------------------------------------------------ รายงาน

const all = ranked();
const [BEST, bestProf] = all[0];
const naiveProf = results.get(NAIVE);
const fmt = (v) => (Number.isFinite(v) ? String(v).padStart(3) : '  ∞');

console.log(`\n══ ${CLASS} · ดีที่สุดที่ค้นเจอ (คะแนน ${total(bestProf)}) ══\n${BEST}`);
console.log('ช่อง            ชั้น | บรรทัดเดียวดีสุด  attack(weakest)  ดีที่สุด | ค่าของโค้ด (เลเวลที่ประหยัด)');
const rows = CELLS.map((c, i) => {
  // ดีที่สุด "ต่อช่อง" — บางช่องโปรแกรมอื่นดีกว่าตัวที่ดีที่สุดโดยรวม
  let cellBest = Infinity, cellBestSrc = null;
  for (const [p, prof] of all) {
    if (prof[i] !== null && prof[i] < cellBest) { cellBest = prof[i]; cellBestSrc = p; }
  }
  const one1 = FALLBACK[i];
  const value = Number.isFinite(one1) && Number.isFinite(cellBest) ? one1 - cellBest
    : Number.isFinite(cellBest) ? Infinity : 0;
  console.log(`${(c.region + ' d' + c.depth).padEnd(15)} ${String(c.floor).padStart(3)} |`
    + `        ${fmt(one1)}              ${fmt(val(naiveProf[i], i))}       ${fmt(cellBest)} | `
    + `${Number.isFinite(value) ? (value > 0 ? '+' : '') + value : 'โค้ดผ่านได้ บรรทัดเดียวผ่านไม่ได้เลย'}`);
  // บรรทัดเดียวไหนชนะที่ช่องนี้ — ต่างกันตามโซน (ภูเขาไฟกับที่อื่นใช้คนละคำสั่ง) = สิ่งที่เกมให้รางวัลจริงตอนนี้
  let oneSrc = null, oneBest = Infinity;
  for (const [p, prof] of results) {
    if (!p.includes('    if ') && prof[i] !== null && prof[i] < oneBest) { oneBest = prof[i]; oneSrc = p; }
  }
  return { ...c, bestOneLine: one1, bestOneLineSrc: oneSrc && oneSrc.split('\n')[1].trim(),
    naive: naiveProf[i], best: cellBest, bestSrc: cellBestSrc, value };
});

console.log('\nห้าอันดับแรก (คะแนนรวม ต่ำ = ดี):');
for (const [p, prof] of all.slice(0, 5)) {
  console.log(`  ${String(total(prof)).padStart(5)}  ${p.split('\n').slice(1).map((l) => l.trim()).filter(Boolean).join(' ⏎ ')}`);
}
log(`เสร็จ · ${battles.toLocaleString()} การรบ · ${validCache.size.toLocaleString()} การตรวจโปรแกรม`);

const out = path.join(__dirname, `../../docs/measurements/progsearch-${CLASS}${TAG ? `-${TAG}` : ''}.json`);
fs.writeFileSync(out, JSON.stringify({
  class: CLASS, pass: PASS, maxLevel: MAXLV, seedsFull: SEEDS_FULL,
  bestOverall: BEST, bestOneLine: BEST_ONE, cells: rows,
  top: all.slice(0, 10).map(([p, prof]) => ({ src: p, total: total(prof), profile: prof })),
}, (k, v) => (v === Infinity ? null : v), 2));
console.log(`ผลเต็ม → ${path.relative(process.cwd(), out)}`);
