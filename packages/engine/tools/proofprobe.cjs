/**
 * proofprobe — วัดเกณฑ์ของสกิลประจำภูมิภาค (docs/design-skill-acquisition.md ระยะ S1)
 *
 * คำถาม: ที่รอบลึกสุดของแต่ละภูมิภาค
 *   1. โปรแกรมที่ทำตามบทเรียนของภูมิภาค "ผ่าน" บ่อยไหม (ควรผ่านเกือบทุกครั้งที่ชนะ)
 *   2. โปรแกรมที่ไม่ทำตามบทเรียน (ตีอย่างเดียว · ตั้งรับตลอด · ฯลฯ) "ผ่าน" ได้ไหม (ต้องไม่ผ่าน แม้ชนะ)
 *
 *   node tools/proofprobe.cjs              ทุกภูมิภาค ทุกอาชีพ
 *   node tools/proofprobe.cjs greenwood    ภูมิภาคเดียว
 *   --seeds N   จำนวน seed ต่อจุด (ค่าเริ่ม 24)
 *
 * ตัวละคร: เลเวล L สเตตัสแจกตามน้ำหนักมาตรฐานของอาชีพ (allocatePoints ไม่มีงาน) ไม่ใส่ของ
 *   และมีสกิลของภูมิภาคที่มาก่อนแล้ว (ป่า → หมู่เกาะ → ซาก → น้ำแข็ง → ภูเขาไฟ)
 * L = เลเวลต่ำสุดที่โปรแกรมตามบทเรียนชนะรอบลึกสุดได้อย่างน้อยครึ่งหนึ่ง แล้ววัดที่ L และ L+4
 * การรบเหมือน BattlesService.regionBattle (enterRegion + สตรีมสุ่มสูตรเดียวกับเซิร์ฟเวอร์)
 */
const E = require('../dist/src/index.js');

const HERO_ID = 'p1';
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const SEEDS = arg('--seeds', 24);
const only = process.argv.slice(2).find((a) => !a.startsWith('--') && Number.isNaN(Number(a)));

/**
 * โปรแกรมทดสอบ — `hit(target, pad)` คือท่าตีหลักของอาชีพ: จอมเวทร่ายลูกไฟก่อน (MP ไม่พอ = ข้ามไปตีธรรมดา)
 * อาชีพอื่นตีธรรมดา เพราะจอมเวทตีธรรมดาอย่างเดียวชนะรอบลึกสุดไม่ได้เลยไม่ว่าเลเวลไหน
 */
const hitFor = (classId) => (target, pad) =>
  classId === 'mage' ? `${pad}cast("firebolt", ${target})\n${pad}attack(${target})\n` : `${pad}attack(${target})\n`;
const P = {
  naive: (hit) => `def turn():\n${hit('weakest(enemies)', '    ')}`,
  deadliest: (hit) => `def turn():\n${hit('deadliest(enemies)', '    ')}`,
  turtle: () => 'def turn():\n    defend()\n',
  marked: (hit) => `def turn():\n    if has_debuff("marked"):\n        defend()\n    else:\n${hit('weakest(enemies)', '        ')}`,
  lowguard: (hit) => `def turn():\n    if me.hp_pct < 35:\n        defend()\n    else:\n${hit('weakest(enemies)', '        ')}`,
  // หมู่เกาะ: ดูแลเลือดตั้งแต่ยังสูง (ตามบทเรียน) เทียบกับตั้งเงื่อนไขต่ำเกินไป · โล่ซ้อนไม่ได้ประโยชน์ จึงถามสถานะก่อน
  care90: (hit, classId) => careProgram(hit, classId, 90),
  care30: (hit, classId) => careProgram(hit, classId, 30),
};
const CARE = { warrior: ['guard_up', ' and not has_buff("shield")'], mage: ['heal', ''], guardian: ['iron_guard', ' and not has_buff("shield")'] };
function careProgram(hit, classId, threshold) {
  const [skill, cond] = CARE[classId];
  return `def turn():\n    if me.hp_pct < ${threshold}${cond}:\n        cast("${skill}", me)\n${hit('weakest(enemies)', '        ')}`
    + `    else:\n${hit('weakest(enemies)', '        ')}`;
}
/** ภูมิภาคที่มาก่อน (เรียงตามความยาก) ถือว่าพิสูจน์แล้ว — ผู้เล่นจริงเดินตามลำดับนี้ */
const ORDER = ['greenwood', 'isles', 'ruins', 'frostland', 'volcano'];
const provedBefore = (regionId) => ORDER.slice(0, ORDER.indexOf(regionId));
const LESSON = { greenwood: 'marked', isles: 'care90', ruins: 'naive', frostland: 'marked', volcano: 'deadliest' };
const OTHERS = {
  greenwood: ['naive', 'lowguard', 'turtle'],
  isles: ['naive', 'care30', 'turtle'],
  ruins: ['deadliest', 'lowguard'],
  frostland: ['naive', 'lowguard', 'turtle'],
  volcano: ['naive', 'lowguard'],
};

function hero(classId, level, src, proved) {
  const stats = { ...E.gamedata.classes[classId].baseStats };
  const zero = { str: 0, int: 0, vit: 0, agi: 0, luk: 0 };
  for (let l = 2; l <= level; l++) {
    const g = E.allocatePoints(zero, E.FORMULAS.statPointsPerLevel, classId, l);
    for (const k of Object.keys(stats)) stats[k] += g[k];
  }
  const derived = E.buildDerivedStats(classId, level, stats, []);
  return {
    id: HERO_ID, name: 'probe', side: 'party', classId, level, stats, derived,
    skills: E.skillsFor(classId, level, proved).map((s) => s.id), rules: [], programSource: src,
  };
}

function fight(regionId, classId, level, src, seed) {
  const depth = E.getRegion(regionId).depths;
  const entry = E.enterRegion(regionId, depth, 1, seed);
  const h = hero(classId, level, src, provedBefore(regionId));
  const rng = E.mulberry32(E.hashSeed(seed, entry.floor * 977, 1, 0xba771e));
  const result = E.simulateWaves([h], entry.waves, { floor: entry.floor, seed, rng });
  return { result, proof: E.regionProof(regionId, depth, result, HERO_ID, h.derived.maxHp) };
}

function measure(regionId, classId, level, name) {
  let wins = 0;
  let passes = 0;
  const failed = {};
  for (let s = 1; s <= SEEDS; s++) {
    const { result, proof } = fight(regionId, classId, level, P[name](hitFor(classId), classId), s * 7919);
    if (result.victory) wins++;
    if (proof.passed) passes++;
    if (result.victory) for (const c of proof.checks) if (!c.ok) failed[c.code] = (failed[c.code] ?? 0) + 1;
  }
  return { wins, passes, failed };
}

function minLevel(regionId, classId) {
  const floor = E.floorForRegion(regionId, E.getRegion(regionId).depths);
  for (let L = Math.max(1, floor - 2); L <= floor + 30; L++) {
    if (measure(regionId, classId, L, LESSON[regionId]).wins * 2 >= SEEDS) return L;
  }
  return null;
}

const fmt = (m) => `ชนะ ${String(m.wins).padStart(2)}/${SEEDS} ผ่าน ${String(m.passes).padStart(2)}`
  + (Object.keys(m.failed).length ? ` · ชนะแต่ตก: ${Object.entries(m.failed).map(([k, v]) => `${k}×${v}`).join(' ')}` : '');

for (const regionId of Object.keys(LESSON)) {
  if (only && only !== regionId) continue;
  const depth = E.getRegion(regionId).depths;
  console.log(`\n== ${regionId} รอบ ${depth} (ชั้น ${E.floorForRegion(regionId, depth)}) · บทเรียน = ${LESSON[regionId]}`);
  for (const classId of ['warrior', 'mage', 'guardian']) {
    const L = minLevel(regionId, classId);
    if (L === null) { console.log(`  ${classId}: ชนะไม่ถึงครึ่งแม้เลเวลสูง`); continue; }
    for (const level of [L, L + 4]) {
      console.log(`  ${classId} Lv${level}`);
      for (const name of [LESSON[regionId], ...OTHERS[regionId]]) {
        console.log(`    ${name.padEnd(10)} ${fmt(measure(regionId, classId, level, name))}`);
      }
    }
  }
}
