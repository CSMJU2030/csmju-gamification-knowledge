#!/usr/bin/env node
/**
 * m2probe — กวาดค่าจูนของกลไกหมายหัว (รอบ 2M) แบบเร็ว ก่อนยืนยันด้วย progsearch เต็ม
 *
 * ไม่ใช่เครื่องมือตัดสินผล — เกณฑ์ M1/M2 วัดด้วย progsearch.cjs (64 seed · ค้นทั้งพื้นที่)
 * ที่นี่แค่ตอบว่า "ค่าชุดไหนน่าลอง" โดยเทียบสองกลุ่มในพื้นที่เล็ก:
 *   บรรทัดเดียว: ทุกการกระทำของอาชีพ (ชุดเดียวกับ progsearch)
 *   อ่านจังหวะ: if has_debuff("marked"): <ตอบสนอง> else: <บรรทัดเดียว>
 * ค่าที่รายงาน = เลเวลขั้นต่ำของบรรทัดเดียวที่ดีที่สุด − ของโปรแกรมอ่านจังหวะที่ดีที่สุด (ต่อช่อง)
 *
 *   npm run build -w engine && POWERS=300,400,500 EVERY=3,4 node engine/tools/m2probe.cjs
 */
const E = require('../dist/src/index.js');

const CLASSES = (process.env.CLASSES || 'warrior,mage,guardian').split(',');
const POWERS = (process.env.POWERS || '400').split(',').map(Number);
const EVERYS = (process.env.EVERY || '3').split(',').map(Number);
const DEPTHS = (process.env.DEPTHS || '3,4,5').split(',').map(Number);
const SEEDS = Number(process.env.SEEDS || 24);
const PASS = 0.8, MAXLV = 40;

const SHAPE = {
  warrior: { str: 0.6, vit: 0.25, agi: 0.08, luk: 0.07 },
  mage: { int: 0.6, vit: 0.25, agi: 0.08, luk: 0.07 },
  guardian: { vit: 0.6, str: 0.25, agi: 0.08, luk: 0.07 },
};
function statsAt(cls, level) {
  const out = { ...E.gamedata.classes[cls].baseStats };
  const pts = (level - 1) * 5; let used = 0;
  const entries = Object.entries(SHAPE[cls]);
  for (const [k, share] of entries.slice(1)) { const v = Math.floor(pts * share); out[k] += v; used += v; }
  out[entries[0][0]] += pts - used;
  return out;
}
function gearAt(cls, floor) {
  const mage = cls === 'mage';
  const mk = (slot, baseId, affix) => ({ id: `g_${slot}`, baseId, slot, rarity: 'uncommon', upgradeLevel: 0, droppedFloor: floor, affixes: [affix] });
  return [
    mk('weapon', mage ? 'staff' : 'sword', { stat: mage ? 'matk_pct' : 'atk_pct', value: 10 }),
    mk('armor', 'plate', { stat: 'hp_pct', value: 8 }),
    mk('helmet', 'helm', { stat: 'def_pct', value: 8 }),
    mk('accessory', mage ? 'amulet' : 'ring', { stat: 'crit_rate', value: 4 }),
  ];
}
const skillsAt = (cls, lv) => E.gamedata.skills.filter((s) => s.classId === cls && s.unlockLevel <= lv).map((s) => s.id);
const hero = (cls, lv, floor, src) => {
  const stats = statsAt(cls, lv); const equipment = gearAt(cls, floor);
  return { id: 'p1', name: 'probe', side: 'party', classId: cls, level: lv, stats,
    derived: E.buildDerivedStats(cls, lv, stats, equipment), skills: skillsAt(cls, lv), rules: [], equipment, programSource: src };
};
const valid = new Map();
function ok(cls, src, floor, lv) {
  const k = `${cls}|${src}|${floor}|${lv}`;
  if (!valid.has(k)) {
    const p = E.parse(src);
    valid.set(k, !!p.program && !p.errors?.length && E.validate(p.program,
      { features: E.unlockedFeatures(floor - 1), availableSkills: skillsAt(cls, lv) }).errors.length === 0);
  }
  return valid.get(k);
}
function winRate(cls, src, depth, lv) {
  const floor = E.floorForRegion('frostland', depth);
  if (!ok(cls, src, floor, lv)) return 0;
  let w = 0;
  for (let s = 0; s < SEEDS; s++) {
    const seed = (floor * 7919 + depth * 131 + s * 104729 + lv * 31) >>> 0;
    const entry = E.enterRegion('frostland', depth, 1, seed);
    const rng = E.mulberry32(E.hashSeed(seed, entry.floor * 977, 1, 0xba771e));
    if (E.simulateWaves([hero(cls, lv, floor, src)], entry.waves, { floor: entry.floor, seed, rng }).victory) w++;
  }
  return w / SEEDS;
}
function minLevel(cls, src, depth) {
  if (winRate(cls, src, depth, MAXLV) < PASS) return Infinity;
  let lo = 1, hi = MAXLV;
  while (lo < hi) { const m = (lo + hi) >> 1; if (winRate(cls, src, depth, m) >= PASS) hi = m; else lo = m + 1; }
  return lo;
}

/**
 * โหมดวัดโปรแกรมเดี่ยว (เกณฑ์ M4 — ทดสอบแบบพยายามล้ม):
 *   EVAL_FILE=โปรแกรม.py CLASS=warrior SEEDS=64 node engine/tools/m2probe.cjs
 * พิมพ์เลเวลขั้นต่ำที่ดินแดนน้ำแข็งแต่ละรอบ ด้วยกติกาเดียวกับ progsearch เป๊ะ (ของ · บิลด์ · validator)
 * "เขียนไม่ได้" = โปรแกรมไม่ผ่าน validator ที่ความสามารถที่ปลดแล้วตอนมาถึงรอบนั้นครั้งแรก
 */
if (process.env.EVAL_FILE) {
  const src = require('fs').readFileSync(process.env.EVAL_FILE, 'utf8');
  const cls = process.env.CLASS || 'warrior';
  const p = E.parse(src);
  if (!p.program || p.errors?.length) { console.log('parse error:', JSON.stringify(p.errors)); process.exit(1); }
  const out = DEPTHS.map((d) => {
    const floor = E.floorForRegion('frostland', d);
    if (!ok(cls, src, floor, MAXLV)) return `d${d} เขียนไม่ได้`;
    const lv = minLevel(cls, src, d);
    return `d${d} ${Number.isFinite(lv) ? lv : '∞'}`;
  });
  console.log(`[${cls} · ${SEEDS} seed] ${out.join('  ')}`);
  process.exit(0);
}

const crush = E.gamedata.skills.find((s) => s.id === "mon_crush");
const GUARDS = (process.env.GUARD || "0.2").split(",").map(Number);
const frost = E.gamedata.regions.find((r) => r.id === 'frostland');
const one = (a) => `def turn():\n    ${a}\n`;
const SEL = ['weakest', 'strongest', 'deadliest', 'fastest'];

for (const guard of GUARDS) for (const every of EVERYS) for (const power of POWERS) {
  crush.power = power; frost.mechanic.every = every; frost.mechanic.guardMult = guard;
  const line = [`every ${every} · power ${power} · guard ${guard}`];
  for (const cls of CLASSES) {
    const cs = E.gamedata.skills.filter((s) => s.classId === cls);
    const name = (s) => E.preferredSkillName(s.id);
    const acts = [...SEL.map((t) => `attack(${t}(enemies))`), 'defend()',
      ...cs.flatMap((s) => (s.kind === 'heal' || s.kind === 'shield') ? [`cast("${name(s)}", me)`]
        : s.aoe ? [`cast("${name(s)}", enemies)`] : SEL.map((t) => `cast("${name(s)}", ${t}(enemies))`))];
    const responses = ['defend()', ...cs.filter((s) => s.kind === 'heal' || s.kind === 'shield').map((s) => `cast("${name(s)}", me)`)];
    const cells = DEPTHS.map((d) => {
      const bestOne = Math.min(...acts.map((a) => minLevel(cls, one(a), d)));
      const bestPhase = Math.min(...responses.flatMap((r) => acts.filter((a) => a !== r).map((a) =>
        minLevel(cls, `def turn():\n    if has_debuff("marked"):\n        ${r}\n    else:\n        ${a}\n`, d))));
      return `d${d} ${bestOne}→${bestPhase} (${Number.isFinite(bestOne - bestPhase) ? (bestOne - bestPhase >= 0 ? '+' : '') + (bestOne - bestPhase) : '∞'})`;
    });
    line.push(`${cls}: ${cells.join('  ')}`);
  }
  console.log(line.join(' | '));
}
