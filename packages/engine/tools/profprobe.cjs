/**
 * เครื่องมือวัดค่าความชำนาญ — "เล่นแบบนี้แล้วได้บิลด์แบบไหน"
 * รันด้วย `npm run profprobe -w engine` (ต้อง build engine ก่อน)
 *
 * ใช้ตอบคำถามเดียว: ถ้าผู้เล่นเขียนโปรแกรมให้เล่นสายหนึ่ง เขาได้แต้มของสายนั้นจริงไหม
 * ถ้าไม่ได้ แปลว่าคำสัญญา "โปรแกรมคือบิลด์" เป็นโมฆะ
 *
 * ผลรอบแรก (19 ก.ย. 2026) พบว่าผู้พิทักษ์ที่ตั้งใจเล่นสายตันได้ AGI 3 จาก 5 แต้ม
 * และคนที่ตันแล้วตีบ้างได้ STR ล้วน — เป็นที่มาของการตัด AGI/LUK ออกจากความชำนาญ
 * และของ PROFICIENCY_WEIGHTS ใน engine/src/types.ts
 *
 * รอบสอง (engine-dev) เพิ่ม:
 *   · เกณฑ์รับงานทั้งสี่ข้อ พร้อมเครื่องหมายผ่าน/ตก
 *   · การกวาดค่า PROFICIENCY_WEIGHTS.vit เพื่อหาค่าที่ถูกจริง (จำลองได้เพราะสูตรเป็นเชิงเส้น
 *     ในงานดิบของช่อง vit: คูณงาน vit ด้วย W/W0 มีผลเท่ากับตั้งน้ำหนักเป็น W)
 *   · การตรวจความทนทาน หลายชั้น/หลาย seed/หลายเลเวล ไม่ใช่จุดเดียว
 */
const E = require('../dist/src/index.js');
const P = require('../dist/src/proficiency.js');
const { getSkill } = require('../dist/src/data.js');
const { gamedata, buildDerivedStats, runBattle, FORMULAS, PROFICIENCY_WEIGHTS } = E;

/** น้ำหนักที่วัดแล้วว่าผ่านเกณฑ์ทั้งสี่ข้อ — ดูตารางกวาดค่าท้ายผลลัพธ์ */
const RECOMMENDED_VIT_WEIGHT = 2;
const W0 = PROFICIENCY_WEIGHTS.vit;

function hero(classId, level, alloc, src) {
  const stats = { ...gamedata.classes[classId].baseStats };
  const pts = (level - 1) * FORMULAS.statPointsPerLevel;
  for (const [k, w] of Object.entries(alloc)) stats[k] += Math.round(pts * w);
  const skills = gamedata.skills.filter(s => s.classId === classId && s.unlockLevel <= level).map(s => s.id);
  return { id: 'hero', name: 'Hero', side: 'party', classId, level, stats,
    derived: buildDerivedStats(classId, level, stats, []), skills,
    rules: gamedata.defaultRules[classId], programSource: src };
}

/**
 * [ชื่อ, คลาส, การแจกแต้มสมมติ, โปรแกรม, เกณฑ์ที่ต้องผ่าน (สเตตัส, ขั้นต่ำจาก 4 แต้ม), จุดวัดเฉพาะ?]
 *
 * สไตล์เฝ้าระวังสามตัวสุดท้ายวัดที่ "เลเวล 8 ชั้น 5" ไม่ใช่จุดหลัก เพราะที่เลเวล 15 ชั้น 3
 * ตัวละครแทบไม่เจ็บเลย (ผู้พิทักษ์ lv15 ที่ชั้น 7 เลือดไม่เคยต่ำกว่า 92%) เงื่อนไข
 * `if me.hp_pct < ...` จึงไม่เคยทำงาน — แปลว่าในรันนั้นมันไม่ได้เล่นสายรับจริง
 * และค่าความชำนาญที่ออกมาเป็น STR ล้วนก็ถูกแล้ว ไม่ใช่บั๊ก
 */
const STYLES = [
  ['นักรบ: ตีอย่างเดียว', 'warrior', { str: 1 },
    'def turn():\n    attack(weakest(enemies))\n', ['str', 3]],
  ['จอมเวท: ร่ายอย่างเดียว', 'mage', { int: 1 },
    'def turn():\n    cast("firebolt", weakest(enemies))\n', ['int', 3]],
  ['ผู้พิทักษ์: ตันล้วน', 'guardian', { vit: 1 },
    'def turn():\n    if me.hp_pct < 60:\n        cast("barrier", me)\n    elif count(enemies) >= 2:\n        cast("taunt", deadliest(enemies))\n    else:\n        defend()\n', ['vit', 3]],
  ['ผู้พิทักษ์: ตันแล้วตีบ้าง', 'guardian', { vit: 0.7, str: 0.3 },
    'def turn():\n    if me.hp_pct < 50:\n        cast("barrier", me)\n    elif count(enemies) >= 2:\n        cast("taunt", deadliest(enemies))\n    else:\n        attack(weakest(enemies))\n', ['vit', 2]],
  // สไตล์เฝ้าระวัง — ไม่มีเกณฑ์ตายตัว แต่ถ้าผลพลิกแปลว่าสูตรเพี้ยน
  ['นักรบ: ตีแล้วการ์ดตอนเลือดน้อย', 'warrior', { str: 0.6, vit: 0.4 },
    'def turn():\n    if me.hp_pct < 60:\n        defend()\n    else:\n        attack(weakest(enemies))\n', null, { floor: 5, level: 8 }],
  ['จอมเวท: ฮีลตัวเอง + ยิง', 'mage', { int: 0.8, vit: 0.2 },
    'def turn():\n    if me.hp_pct < 60:\n        cast("heal", me)\n    else:\n        cast("firebolt", weakest(enemies))\n', null, { floor: 5, level: 8 }],
  ['ผู้พิทักษ์: กางโล่ + ตี (ไม่ยั่วยุ)', 'guardian', { vit: 0.7, str: 0.3 },
    'def turn():\n    if me.hp_pct < 80:\n        cast("barrier", me)\n    else:\n        attack(weakest(enemies))\n', null, { floor: 5, level: 8 }],
];

const MAIN_FLOOR = 3;
const MAIN_LEVEL = 15;
const MAIN_SEED = 99001;
/** เลเวลที่สมน้ำสมเนื้อกับชั้นนั้น — เทียบจาก probe.cjs (คิดเต็มที่ ผ่านชั้น N ที่เลเวล ~2N) */
const FAIR_LEVELS = { 1: [8, 12, 15], 2: [8, 12, 15], 3: [12, 15, 20], 4: [12, 15, 20],
  5: [15, 20, 25], 6: [15, 20, 25], 7: [20, 25], 8: [20, 25] };
const SEEDS = [99001, 4242, 777, 20260919, 31337, 555, 8080];

function runStyle(style, floor, level, seed) {
  const [, cls, alloc, src] = style;
  const h = hero(cls, level, alloc, src);
  const r = runBattle([h], floor, seed);
  const work = P.proficiencyFromBattle(r, 'hero', h.derived.maxHp);
  let offense = 0, defense = 0;
  for (const e of r.events) {
    if (e.actorId !== 'hero') continue;
    const kind = e.action === 'skill' && e.skillId ? getSkill(e.skillId)?.kind : undefined;
    if (e.action === 'defend' || kind === 'taunt' || kind === 'shield') defense++;
    else offense++;
  }
  return { work, offense, defense, victory: r.victory, cls };
}

/** จำลองผลเมื่อ PROFICIENCY_WEIGHTS.vit = W (สูตรเป็นเชิงเส้นในงานดิบช่อง vit) */
const asWeight = (work, W) => ({ ...work, vit: work.vit * (W / W0) });

const f2 = (x) => x.toFixed(2).padStart(7);
const alloc = (work, cls, W, level) => P.allocatePoints(asWeight(work, W), 5, cls, level);
const show = (a) => `str${a.str} int${a.int} vit${a.vit} agi${a.agi} luk${a.luk}`;
const label = (s) => `${s[0]}${s[5] ? ` [ชั้น ${s[5].floor} lv${s[5].level}]` : ''}`;

// ---------------------------------------------------------------- 1. งานดิบ
console.log(`\n=== งานดิบจากการรบจริง (ชั้น ${MAIN_FLOOR} เลเวล ${MAIN_LEVEL} seed ${MAIN_SEED}) ===`);
console.log('สไตล์การเล่น'.padEnd(40), '|    str    int    vit | เทิร์นรุก/รับ | ผล');
console.log('-'.repeat(88));
const main = STYLES.map((s) => {
  const m = runStyle(s, s[5]?.floor ?? MAIN_FLOOR, s[5]?.level ?? MAIN_LEVEL, MAIN_SEED);
  console.log(label(s).padEnd(40), '|', `${f2(m.work.str)}${f2(m.work.int)}${f2(m.work.vit)}`,
    '|', `${String(m.offense).padStart(5)}/${String(m.defense).padEnd(6)}`,
    '|', m.victory ? 'ชนะ' : 'แพ้');
  return m;
});

// ------------------------------------------------- 2. แต้มที่ได้ + เกณฑ์รับงาน
console.log(`\n=== แต้มที่ได้ต่อเลเวล (4 แต้มความชำนาญ + 1 แต้มเฉื่อยไป AGI/LUK) ===`);
console.log(`ค่าที่ตั้งอยู่ใน types.ts คือ PROFICIENCY_WEIGHTS.vit = ${W0}`
  + (W0 === RECOMMENDED_VIT_WEIGHT ? '' : ` · ค่าที่วัดแล้วแนะนำคือ ${RECOMMENDED_VIT_WEIGHT}`));
console.log('สไตล์การเล่น'.padEnd(40), `| vit=${W0}`.padEnd(26),
  `| vit=${RECOMMENDED_VIT_WEIGHT}`.padEnd(26), '| เกณฑ์');
console.log('-'.repeat(110));
for (const [i, s] of STYLES.entries()) {
  const need = s[4];
  const lv = s[5]?.level ?? MAIN_LEVEL;
  const cur = alloc(main[i].work, s[1], W0, lv);
  const rec = alloc(main[i].work, s[1], RECOMMENDED_VIT_WEIGHT, lv);
  const mark = (a) => (need ? (a[need[0]] >= need[1] ? ' ✓' : ' ✗') : '  ');
  console.log(label(s).padEnd(40), '|', (show(cur) + mark(cur)).padEnd(24),
    '|', (show(rec) + mark(rec)).padEnd(24), '|', need ? `${need[0]} >= ${need[1]}` : '(เฝ้าระวัง)');
}

// ------------------------------------------------------ 3. กวาดค่าน้ำหนัก vit
console.log('\n=== กวาดค่า PROFICIENCY_WEIGHTS.vit — จำนวนเคสที่ "ไม่เข้าเกณฑ์" ===');
console.log(`ทดสอบเฉพาะคู่ชั้น/เลเวลที่สมน้ำสมเนื้อ (${SEEDS.length} seed x ชั้น 1-8) · 0 = ผ่านหมด`);
const WS = [1, 1.5, 2, 2.5, 3, 5, 7, 9];
const graded = STYLES.filter((s) => s[4]);
const cases = graded.map((s) => {
  const runs = [];
  for (const floor of Object.keys(FAIR_LEVELS).map(Number)) {
    for (const level of FAIR_LEVELS[floor]) {
      for (const seed of SEEDS) runs.push({ ...runStyle(s, floor, level, seed), level });
    }
  }
  return { style: s, runs };
});
console.log('สไตล์ (เกณฑ์)'.padEnd(32), WS.map((w) => `vit=${w}`.padStart(8)).join(''));
for (const c of cases) {
  const [name, cls, , , need] = c.style;
  const cells = WS.map((W) => {
    const fails = c.runs.filter((r) => alloc(r.work, cls, W, r.level)[need[0]] < need[1]).length;
    return `${fails}/${c.runs.length}`.padStart(8);
  });
  console.log(`${name} (${need[0]}>=${need[1]})`.padEnd(32), cells.join(''));
}
console.log(`\nสรุป: ค่าที่ทำให้ทั้งสี่ข้อผ่านครบคือ vit = ${RECOMMENDED_VIT_WEIGHT}`
  + ` (ตอนนี้ตั้งไว้ ${W0})`);
