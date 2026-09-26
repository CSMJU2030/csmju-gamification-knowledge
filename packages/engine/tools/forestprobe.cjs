/**
 * forestprobe — ผู้เล่นใหม่ในป่าเริ่มต้น (playtest รอบ B · 26 ก.ย. 2026)
 *
 * คำถามของเครื่องมือนี้มาจากผู้เล่นจริงที่เล่นจนจบป่า (docs/playtest/round-a-2026-09-26.md):
 *   1. โตเร็วไหม — กี่การรบถึงจบป่า · จบที่เลเวลเท่าไร · การรบแรกพาไปเลเวลไหน
 *   2. defend มีที่ใช้ไหม — ตัวละครเดียวกัน seed เดียวกัน เทียบ "ตีอย่างเดียว" กับ "รับตอนที่ควรรับ"
 *   3. ใช้สกิลได้ตั้งแต่เลือกอาชีพไหม — persona ใช้โปรแกรมที่ดีที่สุด "เท่าที่ validate จริงยอมให้เขียน"
 *
 *   node tools/forestprobe.cjs           ทุก persona (12 ชีวิตต่อ persona)
 *   node tools/forestprobe.cjs defend    เทียบโปรแกรมต่อรอบของป่า บนตัวละครจริงจากเส้นทางตีอย่างเดียว
 *   node tools/forestprobe.cjs <persona> --log   ดูทีละการรบของชีวิตแรก
 *   --nogear   ไม่ใส่ของที่ดรอปเลย (ผู้เล่นใหม่ที่ไม่เคยเปิดกระเป๋า)
 *
 * ความซื่อสัตย์ของเครื่องมือ:
 *  · การรบเหมือน BattlesService.regionBattle ทุกขั้น (enterRegion + สตรีมสุ่มสูตรเดียวกับเซิร์ฟเวอร์)
 *  · เลเวล/แต้ม/งานสะสม เหมือน progress() ของ backend · ใส่ของที่ดรอปถ้าแรงขึ้น (เหมือน lazyprobe)
 *  · นิสัย: ท้ารอบถัดไปเสมอ แพ้ก็ท้ารอบเดิมซ้ำ (ไม่ถอยไปฟาร์ม — ทางที่ผู้เล่นจริงใช้หลังรอบ 2F)
 *  · ไม่จำลองตีบวก/ร้านค้า — ผู้เล่นจริงแรงกว่านี้เล็กน้อย
 */
const E = require('../dist/src/index.js');

const REGION = 'greenwood';
const HERO_ID = 'p1';
const PARTY_SIZE = 1;
const LIVES = 12;
const NO_GEAR = process.argv.includes('--nogear');
/** แพ้รวมเกินนี้ในป่า = ตัน (ผู้เล่นจริงเลิกเล่นก่อนแน่) */
const MAX_BATTLES = 40;

const NAIVE = 'def turn():\n    attack(weakest(enemies))\n';
const GUARD = 'def turn():\n    if me.hp_pct < 35:\n        defend()\n    else:\n        attack(weakest(enemies))\n';
const MARKED = 'def turn():\n    if has_debuff("marked"):\n        defend()\n    else:\n        attack(weakest(enemies))\n';
/** ใช้สกิลเมื่อ MP พอ + อ่านท่า (if ซ้อน — ไม่ต้องรอ elif) */
const skillProgram = (cast, cost) =>
  'def turn():\n'
  + '    if has_debuff("marked"):\n'
  + '        defend()\n'
  + '    else:\n'
  + `        if me.mp >= ${cost}:\n`
  + `            ${cast}\n`
  + '        else:\n'
  + '            attack(weakest(enemies))\n';

const PERSONAS = {
  attack: { label: 'ตีอย่างเดียว (ไม่เคยแก้โค้ด)', classId: 'warrior', versions: [NAIVE] },
  guard: { label: 'รับตอนเลือดน้อย (if เดียว)', classId: 'warrior', versions: [NAIVE, GUARD] },
  marked: { label: 'อ่านท่า (defend เฉพาะตอนถูกหมายหัว)', classId: 'warrior', versions: [NAIVE, MARKED] },
  warrior: {
    label: 'นักรบใช้สกิล + อ่านท่า',
    classId: 'warrior',
    versions: [NAIVE, MARKED, skillProgram('cast("power_strike", weakest(enemies))', 8)],
  },
  mage: {
    label: 'จอมเวทใช้สกิล + อ่านท่า',
    classId: 'mage',
    versions: [NAIVE, MARKED, skillProgram('cast("firebolt", weakest(enemies))', 7)],
  },
  guardian: {
    label: 'ผู้พิทักษ์ใช้สกิล + อ่านท่า',
    classId: 'guardian',
    versions: [NAIVE, MARKED, skillProgram('cast("shield_bash", weakest(enemies))', 8)],
  },
};

// ---------------------------------------------------------------- ตัวละคร (เหมือน lazyprobe)

function newCharacter(seed) {
  return {
    classId: 'novice',
    level: 1,
    exp: 0,
    stats: { ...E.gamedata.classes.novice.baseStats },
    carry: { str: 0, int: 0, vit: 0, agi: 0, luk: 0 },
    equipment: {},
    highestFloor: 0,
    battles: 0,
    losses: 0,
    rng: E.mulberry32(E.hashSeed(seed, 0x1a2f, 7)),
  };
}
const equipmentList = (ch) => Object.values(ch.equipment);
const skillsNow = (ch) =>
  E.gamedata.skills.filter((s) => s.classId === ch.classId && s.unlockLevel <= ch.level).map((s) => s.id);

function combatantOf(ch, src) {
  const equipment = equipmentList(ch);
  return {
    id: HERO_ID, name: 'probe', side: 'party', classId: ch.classId, level: ch.level, stats: ch.stats,
    derived: E.buildDerivedStats(ch.classId, ch.level, ch.stats, equipment),
    skills: skillsNow(ch), rules: [], equipment, programSource: src,
  };
}
function power(ch, equipment) {
  const d = E.buildDerivedStats(ch.classId, ch.level, ch.stats, equipment);
  return (ch.classId === 'mage' ? d.matk : d.atk) * 2 + d.maxHp * 0.25 + d.def * 1.5;
}
function takeLoot(ch, items) {
  for (const item of items) {
    const withNew = equipmentList(ch).filter((e) => e.slot !== item.slot).concat([item]);
    if (!ch.equipment[item.slot] || power(ch, withNew) > power(ch, equipmentList(ch))) ch.equipment[item.slot] = item;
  }
}

/** โปรแกรมนี้บันทึกได้ไหม ณ ตอนนี้ (ไวยากรณ์ที่ปลดแล้ว + สกิลที่มีจริง) — ใช้ validate ตัวเดียวกับเซิร์ฟเวอร์ */
function allowed(ch, src) {
  const p = E.parse(src);
  if (!p.program || p.errors.length) return false;
  return E.validate(p.program, { features: E.unlockedFeatures(ch.highestFloor), availableSkills: skillsNow(ch) }).errors.length === 0;
}
const programNow = (ch, persona) => [...persona.versions].reverse().find((v) => allowed(ch, v)) ?? NAIVE;

function simulate(ch, depth, src, seed) {
  const entry = E.enterRegion(REGION, depth, PARTY_SIZE, seed);
  const hero = combatantOf(ch, src);
  const rng = E.mulberry32(E.hashSeed(seed, entry.floor * 977, PARTY_SIZE, 0xba771e));
  const result = E.simulateWaves([hero], entry.waves, { floor: entry.floor, seed, rng });
  return { result, hero, floor: entry.floor };
}

function fight(ch, depth, src) {
  const seed = Math.floor(ch.rng() * 0x100000000);
  const { result, hero, floor } = simulate(ch, depth, src, seed);
  const w = E.proficiencyFromBattle(result, HERO_ID, hero.derived.maxHp);
  const work = {};
  for (const k of Object.keys(ch.carry)) work[k] = ch.carry[k] + w[k];
  let leveled = false;
  let exp = ch.exp + result.expGained;
  while (exp >= E.FORMULAS.expToNext(ch.level)) {
    exp -= E.FORMULAS.expToNext(ch.level);
    ch.level += 1;
    leveled = true;
    const g = E.allocatePoints(work, E.FORMULAS.statPointsPerLevel, ch.classId, ch.level);
    for (const k of Object.keys(ch.stats)) ch.stats[k] += g[k];
  }
  ch.exp = exp;
  ch.carry = leveled ? { str: 0, int: 0, vit: 0, agi: 0, luk: 0 } : work;
  if (!NO_GEAR) takeLoot(ch, result.drops.items);
  ch.battles += 1;
  if (!result.victory) ch.losses += 1;
  if (result.victory && floor > ch.highestFloor) ch.highestFloor = floor;
  return { victory: result.victory, waves: result.wavesCleared, exp: result.expGained };
}

const statSum = (ch) => Object.values(ch.stats).reduce((a, b) => a + b, 0);

function journey(persona, seed, onBeforeFight) {
  const ch = newCharacter(seed);
  const log = [];
  let firstWinLevel = null;
  let depth = 1;
  while (depth <= 4 && ch.battles < MAX_BATTLES) {
    if (ch.classId === 'novice' && ch.highestFloor >= 1) ch.classId = persona.classId;
    const src = programNow(ch, persona);
    if (onBeforeFight) onBeforeFight(ch, depth);
    const r = fight(ch, depth, src);
    const tag = src === NAIVE ? 'ตี' : src === GUARD ? 'รับตอนเลือดน้อย' : src === MARKED ? 'อ่านท่า' : 'สกิล+อ่านท่า';
    log.push(`  #${ch.battles} รอบ ${depth} ${r.victory ? 'ชนะ' : `แพ้ ${r.waves}/10`} · ${tag} · EXP +${r.exp} → lv ${ch.level} · สเตตัสรวม ${statSum(ch)}`);
    if (r.victory && depth === 1 && firstWinLevel === null) firstWinLevel = ch.level;
    if (r.victory) depth++;
  }
  return { ch, log, cleared: depth > 4, firstWinLevel };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const range = (xs) => `${Math.min(...xs)}–${Math.max(...xs)}`;

function summarize(name) {
  const persona = PERSONAS[name];
  const lives = [];
  for (let i = 0; i < LIVES; i++) lives.push(journey(persona, 4242 + i * 101));
  const done = lives.filter((l) => l.cleared);
  const b = lives.map((l) => l.ch.battles);
  return {
    name,
    label: persona.label,
    lives,
    cleared: done.length,
    battles: `${median(b)} (${range(b)})`,
    losses: median(lives.map((l) => l.ch.losses)),
    lvFirst: median(lives.map((l) => l.firstWinLevel ?? l.ch.level)),
    lvEnd: `${median(lives.map((l) => l.ch.level))} (${range(lives.map((l) => l.ch.level))})`,
    statEnd: median(lives.map((l) => statSum(l.ch))),
  };
}

function report(names, withLog) {
  console.log(`ป่าเริ่มต้น · ${LIVES} ชีวิตต่อ persona · ท้ารอบถัดไปเสมอ · ตันเมื่อรบครบ ${MAX_BATTLES} ครั้ง${NO_GEAR ? ' · ไม่ใส่ของเลย' : ''}`);
  console.log('persona                                  | จบป่า | การรบ มัธยฐาน (ช่วง) | แพ้ | lv ตอนชนะรอบ 1 | lv ตอนจบ | สเตตัสรวมตอนจบ');
  for (const n of names) {
    const s = summarize(n);
    console.log(`${s.label.padEnd(40)} | ${String(s.cleared).padStart(2)}/${LIVES} | ${s.battles.padEnd(20)} | ${String(s.losses).padStart(3)} | ${String(s.lvFirst).padStart(14)} | ${s.lvEnd.padEnd(8)} | ${s.statEnd}`);
    if (withLog) for (const line of s.lives[0].log) console.log(line);
  }
}

/** เทียบโปรแกรมบนตัวละครตัวเดียวกัน ณ ตอนก่อนท้าแต่ละรอบ (เก็บจากเส้นทาง "ตีอย่างเดียว") */
function defendReport() {
  const SEEDS = 240;
  const snaps = {};
  for (let i = 0; i < LIVES; i++) {
    journey(PERSONAS.attack, 4242 + i * 101, (ch, depth) => {
      (snaps[depth] ||= []).push(JSON.parse(JSON.stringify({ ...ch, rng: null })));
    });
  }
  const progs = { 'ตีอย่างเดียว': NAIVE, 'รับตอนเลือด<35%': GUARD, 'อ่านท่า': MARKED, 'รับตลอด': 'def turn():\n    defend()\n' };
  console.log(`ชนะกี่ % · เลือดเหลือเฉลี่ยของรอบที่ชนะ — ตัวละครจริงก่อนท้าแต่ละรอบ × ${SEEDS} seed (ไม่ดูว่าไวยากรณ์ปลดหรือยัง)`);
  for (let depth = 1; depth <= 4; depth++) {
    const list = snaps[depth] ?? [];
    if (!list.length) continue;
    const cells = [];
    for (const [label, src] of Object.entries(progs)) {
      let wins = 0, hp = 0, n = 0;
      for (let s = 0; s < SEEDS; s++) {
        const ch = list[s % list.length];
        const { result, hero } = simulate(ch, depth, src, 90000 + s * 131 + depth);
        n++;
        if (result.victory) {
          wins++;
          const last = [...result.events].reverse().find((e) => e.targets.some((t) => t.id === HERO_ID));
          hp += (last ? last.targets.find((t) => t.id === HERO_ID).hpAfter : hero.derived.maxHp) / hero.derived.maxHp;
        }
      }
      cells.push(`${label} ${String(Math.round((wins / n) * 100)).padStart(3)}%${wins ? ` (เลือด ${Math.round((hp / wins) * 100)}%)` : ''}`);
    }
    const lv = list.map((c) => c.level);
    console.log(`  รอบ ${depth} lv ${range(lv)}: ${cells.join(' · ')}`);
  }
}

const args = process.argv.slice(2);
if (args[0] === 'defend') defendReport();
else if (args[0] && PERSONAS[args[0]]) report([args[0]], args.includes('--log'));
else if (args[0] === '--nogear') report(Object.keys(PERSONAS), false);
else report(Object.keys(PERSONAS), false);
