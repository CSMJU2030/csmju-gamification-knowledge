/**
 * lineprobe — วัดเกณฑ์ของสกิลจากความชำนาญ (docs/design-skill-acquisition.md ระยะ S3 ข้อ 8.3)
 *
 * คำถาม: ผู้เล่นที่เขียนโปรแกรมสไตล์หนึ่ง ได้สกิลสายไหน ที่เลเวลเท่าไร
 *   · สายหลักของสไตล์ต้องได้ในช่วงกลางเกม (ไม่ใช่ทันที และไม่ใช่ไม่มีวันได้)
 *   · สายที่สไตล์นั้นไม่ได้เล่น ต้องไม่ได้ (หรือได้ช้ามาก) — สกิลสายคือรางวัลของสไตล์ ไม่ใช่ของแจก
 *
 *   node tools/lineprobe.cjs    --seeds N (ค่าเริ่ม 8) --max L (เลเวลสูงสุดที่จำลอง ค่าเริ่ม 30)
 *
 * จำลอง "ชีวิต" แบบย่อ: เริ่มสเตตัสผู้ฝึกหัด · ทุกเลเวลรบหอคอยหนึ่งครั้งที่ชั้น ≈ เลเวล/2.2
 * แล้วแจกแต้มของเลเวลถัดไปจากงานของการรบนั้น (allocatePoints ตัวเดียวกับเซิร์ฟเวอร์)
 * ตัวละครมีสกิลตามเลเวลและสกิลภูมิภาคทุกตัว (เหมือนผู้เล่นที่เดินแผนที่ไปพร้อมกัน)
 */
const E = require('../dist/src/index.js');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const SEEDS = arg('--seeds', 8);
const MAX = arg('--max', 30);
const T = E.gamedata.acquisition.lineThreshold;
const ALL_REGIONS = ['greenwood', 'isles', 'ruins', 'frostland', 'volcano'];

const I = '    ';
const p = (lines) => `def turn():\n${lines.map((l) => I + l).join('\n')}\n`;

const STYLES = [
  ['นักรบ: ตีอย่างเดียว', 'warrior', p(['attack(weakest(enemies))'])],
  ['นักรบ: ท่าแรง + ตี', 'warrior', p(['cast("power_strike", strongest(enemies))', 'attack(weakest(enemies))'])],
  ['นักรบ: ฮีลตัวเองบ่อย', 'warrior', p(['if me.hp_pct < 70:', `${I}cast("second_wind", me)`, 'cast("power_strike", weakest(enemies))', 'attack(weakest(enemies))'])],
  ['นักรบ: ตั้งรับเป็น', 'warrior', p(['if me.hp_pct < 60:', `${I}cast("brace", me)`, `${I}defend()`, 'attack(weakest(enemies))'])],
  ['จอมเวท: ลูกไฟอย่างเดียว', 'mage', p(['cast("firebolt", weakest(enemies))', 'attack(weakest(enemies))'])],
  ['จอมเวท: ไฟ + ฮีล', 'mage', p(['if me.hp_pct < 50:', `${I}cast("mend", me)`, 'cast("firebolt", weakest(enemies))', 'attack(weakest(enemies))'])],
  ['จอมเวท: โล่ + ยืนรับ', 'mage', p(['if not has_buff("shield"):', `${I}cast("mana_veil", me)`, 'if me.hp_pct < 60:', `${I}defend()`, 'cast("firebolt", weakest(enemies))'])],
  ['จอมเวท: ตีด้วยมือ', 'mage', p(['attack(weakest(enemies))'])],
  ['ผู้พิทักษ์: ตันล้วน', 'guardian', p(['if me.hp_pct < 60:', `${I}cast("iron_guard", me)`, 'if count(enemies) >= 2 and not has_buff("taunt"):', `${I}cast("taunt", me)`, 'if me.hp_pct < 80:', `${I}defend()`, 'attack(weakest(enemies))'])],
  ['ผู้พิทักษ์: กระแทกอย่างเดียว', 'guardian', p(['cast("shield_bash", weakest(enemies))', 'attack(weakest(enemies))'])],
  ['ผู้พิทักษ์: ฮีลตัวเองบ่อย', 'guardian', p(['if me.hp_pct < 70:', `${I}cast("rally", me)`, 'cast("shield_bash", weakest(enemies))', 'attack(weakest(enemies))'])],
];

function life(classId, src, seed) {
  const stats = { ...E.gamedata.classes.novice.baseStats };
  const reached = { str: null, int: null, vit: null };
  for (let level = 1; level <= MAX; level++) {
    const prog = E.lineProgress(stats);
    for (const k of ['str', 'int', 'vit']) if (reached[k] === null && prog[k] >= T) reached[k] = level;
    const derived = E.buildDerivedStats(classId, level, stats, []);
    const skills = E.skillsFor(classId, level, { provedRegions: ALL_REGIONS }).map((s) => s.id);
    const hero = { id: 'p1', name: 'p', side: 'party', classId, level, stats: { ...stats }, derived, skills, rules: [], programSource: src };
    const floor = Math.min(10, Math.max(1, Math.round(level / 2.2)));
    const r = E.runBattle([hero], floor, seed * 1009 + level);
    const work = E.proficiencyFromBattle(r, 'p1', derived.maxHp);
    const g = E.allocatePoints(work, E.FORMULAS.statPointsPerLevel, classId, level + 1);
    for (const k of Object.keys(stats)) stats[k] += g[k];
  }
  return { reached, stats };
}

const median = (xs) => {
  const s = xs.map((x) => (x === null ? Infinity : x)).sort((a, b) => a - b);
  const m = s[Math.floor(s.length / 2)];
  return m === Infinity ? '—' : String(m);
};

console.log(`เกณฑ์: แต้มที่ความชำนาญแจกให้สาย ≥ ${T} · ${SEEDS} ชีวิตต่อสไตล์ · จำลองถึงเลเวล ${MAX}`);
console.log('ตัวเลข = เลเวลมัธยฐานที่ได้สกิลสายนั้น (— = ไม่ถึงภายในเลเวลที่จำลอง) · [ได้กี่ชีวิต]');
for (const [name, cls, src] of STYLES) {
  const runs = [];
  for (let s = 1; s <= SEEDS; s++) runs.push(life(cls, src, s));
  const col = (k) => `${k.toUpperCase()} ${median(runs.map((r) => r.reached[k])).padStart(2)} [${runs.filter((r) => r.reached[k] !== null).length}/${SEEDS}]`;
  const last = runs[0].stats;
  console.log(`${name.padEnd(30)} ${col('str')}  ${col('int')}  ${col('vit')}   (ชีวิตแรกจบที่ STR ${last.str} INT ${last.int} VIT ${last.vit})`);
}
