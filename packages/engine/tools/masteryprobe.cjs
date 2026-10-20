/**
 * masteryprobe — วัดเกณฑ์ของสกิลขั้น 2 (docs/design-skill-acquisition.md ระยะ S2 ข้อ 8.1)
 *
 * คำถาม: ต่อการรบหนึ่งครั้ง (หอคอยชั้นที่เลเวลนั้นชนะได้)
 *   1. โปรแกรมที่ใช้สกิลถูกจังหวะ ได้ครั้งที่นับ (credited) เท่าไร → ต้องรบกี่ครั้งถึงขั้น 2
 *   2. โปรแกรมที่ร่ายรัว (สแปม) ได้เท่าไร → ต้องเป็น 0 เกือบทุกครั้ง
 *
 *   node tools/masteryprobe.cjs            ทุกสกิล
 *   node tools/masteryprobe.cjs execute    สกิลเดียว (ชื่อสั้น)
 *   --seeds N   จำนวน seed ต่อจุด (ค่าเริ่ม 20)
 *
 * ตัวละคร: สเตตัสแจกตามน้ำหนักมาตรฐานของอาชีพ ไม่ใส่ของ · สู้หอคอย 3 ชั้นที่เลเวลนั้นพอชนะ (เลเวล = ชั้น × 2 + 3)
 */
const E = require('../dist/src/index.js');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const SEEDS = arg('--seeds', 20);
const only = process.argv.slice(2).find((a) => !a.startsWith('--') && Number.isNaN(Number(a)));

const IND = '    ';
const prog = (body) => `def turn():\n${body}`;
const guarded = (cond, action, fallback = 'attack(weakest(enemies))') =>
  prog(`${IND}if ${cond}:\n${IND}${IND}${action}\n${IND}else:\n${IND}${IND}${fallback}\n`);

/** สกิล → อาชีพ · ชั้นที่ใช้วัด · โปรแกรมตามจังหวะ · โปรแกรมสแปม */
const CASES = {
  power_strike: {
    cls: 'warrior', floors: [2, 4, 6],
    lesson: prog(`${IND}cast("power_strike", strongest(enemies))\n${IND}attack(weakest(enemies))\n`),
    spam: prog(`${IND}cast("power_strike", weakest(enemies))\n${IND}attack(weakest(enemies))\n`),
  },
  whirlwind: {
    cls: 'warrior', floors: [3, 5, 7],
    lesson: guarded('count(enemies) >= 3', 'cast("whirlwind", enemies)'),
    spam: prog(`${IND}cast("whirlwind", enemies)\n${IND}attack(weakest(enemies))\n`),
  },
  execute: {
    cls: 'warrior', floors: [5, 7, 9],
    lesson: guarded('weakest(enemies).hp_pct < 30', 'cast("execute", weakest(enemies))'),
    spam: prog(`${IND}cast("execute", weakest(enemies))\n${IND}attack(weakest(enemies))\n`),
  },
  firebolt: {
    cls: 'mage', floors: [2, 4, 6],
    lesson: guarded('count(enemies) <= 2', 'cast("firebolt", weakest(enemies))', 'cast("blizzard", enemies)'),
    spam: prog(`${IND}cast("firebolt", weakest(enemies))\n${IND}attack(weakest(enemies))\n`),
  },
  blizzard: {
    cls: 'mage', floors: [3, 5, 7],
    lesson: guarded('count(enemies) >= 3', 'cast("blizzard", enemies)', 'cast("firebolt", weakest(enemies))'),
    spam: prog(`${IND}cast("blizzard", enemies)\n${IND}cast("firebolt", weakest(enemies))\n`),
  },
  heal: {
    cls: 'mage', floors: [4, 6, 8],
    lesson: guarded('me.hp_pct < 50', 'cast("heal", me)', 'cast("firebolt", weakest(enemies))'),
    spam: prog(`${IND}cast("heal", me)\n${IND}cast("firebolt", weakest(enemies))\n`),
  },
  shield_bash: {
    cls: 'guardian', floors: [2, 4, 6],
    lesson: prog(`${IND}if not has_buff("taunt"):\n${IND}${IND}cast("taunt", me)\n${IND}cast("shield_bash", weakest(enemies))\n${IND}attack(weakest(enemies))\n`),
    spam: prog(`${IND}cast("shield_bash", weakest(enemies))\n${IND}attack(weakest(enemies))\n`),
  },
  taunt: {
    cls: 'guardian', floors: [2, 4, 6],
    lesson: guarded('count(enemies) >= 2 and not has_buff("taunt")', 'cast("taunt", me)', 'cast("shield_bash", weakest(enemies))'),
    spam: prog(`${IND}if not has_buff("taunt"):\n${IND}${IND}cast("taunt", me)\n${IND}cast("shield_bash", weakest(enemies))\n`),
  },
  barrier: {
    cls: 'guardian', floors: [4, 6, 8],
    lesson: guarded('me.hp_pct < 70 and not has_buff("shield")', 'cast("barrier", me)', 'cast("shield_bash", weakest(enemies))'),
    spam: prog(`${IND}if not has_buff("shield"):\n${IND}${IND}cast("barrier", me)\n${IND}cast("shield_bash", weakest(enemies))\n`),
  },
};

function hero(classId, level, src) {
  const stats = { ...E.gamedata.classes[classId].baseStats };
  const zero = { str: 0, int: 0, vit: 0, agi: 0, luk: 0 };
  for (let l = 2; l <= level; l++) {
    const g = E.allocatePoints(zero, E.FORMULAS.statPointsPerLevel, classId, l);
    for (const k of Object.keys(stats)) stats[k] += g[k];
  }
  const derived = E.buildDerivedStats(classId, level, stats, []);
  return {
    id: 'p1', name: 'probe', side: 'party', classId, level, stats, derived,
    skills: E.skillsFor(classId, level).map((s) => s.id), rules: [], programSource: src,
  };
}

function measure(name, c, src) {
  const skillId = E.resolveSkillName(name).id;
  let battles = 0;
  let wins = 0;
  let casts = 0;
  let correct = 0;
  let credited = 0;
  let creditedBattles = 0;
  for (const floor of c.floors) {
    const level = floor * 2 + 3;
    for (let s = 1; s <= SEEDS; s++) {
      const h = hero(c.cls, level, src);
      const r = E.runBattle([h], floor, s * 7919 + floor);
      const t = E.masteryFromBattle(r.events, 'p1', h.derived.maxHp)[skillId];
      battles++;
      if (r.victory) wins++;
      if (!t) continue;
      casts += t.casts;
      correct += t.correct;
      credited += t.credited;
      if (t.credited > 0) creditedBattles++;
    }
  }
  return { battles, wins, casts, correct, credited, creditedBattles };
}

const need = E.gamedata.acquisition.masteryNeed;
const fmt = (m) => {
  const perBattle = m.credited / m.battles;
  const toRank = perBattle > 0 ? Math.ceil(need / perBattle) : '∞';
  return `ชนะ ${String(m.wins).padStart(2)}/${m.battles} · ร่าย ${(m.casts / m.battles).toFixed(1)}/การรบ`
    + ` · ถูก ${m.casts ? Math.round((m.correct / m.casts) * 100) : 0}%`
    + ` · นับ ${perBattle.toFixed(1)}/การรบ (${m.creditedBattles}/${m.battles} การรบ) · ถึงขั้น 2 ใน ~${toRank} การรบ`;
};

console.log(`เกณฑ์: ถูกจังหวะ ≥ ${Math.round(E.gamedata.acquisition.masteryMinShare * 100)}% ต่อการรบ · ขั้น 2 ที่ ${need} ครั้ง · ${SEEDS} seed × 3 ชั้น`);
for (const [name, c] of Object.entries(CASES)) {
  if (only && only !== name) continue;
  console.log(`\n== ${name} (${c.cls}) ชั้น ${c.floors.join('/')}`);
  console.log(`  ตามจังหวะ  ${fmt(measure(name, c, c.lesson))}`);
  console.log(`  สแปม       ${fmt(measure(name, c, c.spam))}`);
}
