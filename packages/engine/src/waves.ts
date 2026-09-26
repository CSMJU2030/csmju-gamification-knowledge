/**
 * Wave generation per gamedata.floorScaling.
 */
import { FORMULAS } from './types';
import type { BaseStats, Combatant, EliteSpawn, RegionMechanic, Rule, WaveSpec } from './types';
import { gamedata } from './data';
import type { BossDef, MonsterArchetype } from './data';
import { hashSeed, mulberry32, pick, rngInt, type Rng } from './rng';
import { derivedFromBase } from './stats';

/**
 * ปุ่มจูนความยาก — ย้ายไปอยู่ใน gamedata.json (`balance`) เมื่อ 19 ก.ย. 2026
 * เพราะหลักการของโปรเจกต์คือ "ปรับ balance ได้โดยไม่แตะโค้ด" แต่สามค่านี้ซึ่งเป็น
 * ปุ่มที่แรงที่สุดกลับฝังอยู่ในโค้ด ทำให้การกวาดหาค่าที่ถูกต้องช้าโดยไม่จำเป็น
 * ชื่อเดิมยัง export ไว้เพราะเทสต์และเครื่องมือวัดอ้างถึงอยู่
 *
 * สเตตัสพื้นฐานของมอนแต่ละตัว =
 * round(archetypeStat * (1 + monsterStatGrowthPerLevel * (monsterLevel - 1)))
 */
export const MONSTER_STAT_GROWTH_PER_LEVEL = gamedata.balance.monsterStatGrowthPerLevel;
/**
 * Monsters use the player-grade derived formulas, which makes each mob nearly a
 * full player; these mults cut every monster's maxHp and atk/matk down to
 * mob-grade after derived-stat computation. Boss hpMult/dmgMult from gamedata
 * apply ON TOP of these. Tuned (2026-09-04 grid search) so that: fresh level-1
 * of every class clears floor 1, L6 warrior clears floor 2, L10 clears floor 3,
 * L1 never clears floor 5, and solo guardian stays far under the 200-round cap.
 */
export const MONSTER_HP_MULT = gamedata.balance.monsterHpMult;
export const MONSTER_DMG_MULT = gamedata.balance.monsterDmgMult;

export function monsterLevelForFloor(floor: number): number {
  return floor * 2;
}

function scaleStats(base: BaseStats, level: number): BaseStats {
  const m = 1 + MONSTER_STAT_GROWTH_PER_LEVEL * (level - 1);
  return {
    str: Math.round(base.str * m),
    int: Math.round(base.int * m),
    vit: Math.round(base.vit * m),
    agi: Math.round(base.agi * m),
    luk: Math.round(base.luk * m),
  };
}

function cloneRules(rules: Rule[]): Rule[] {
  return JSON.parse(JSON.stringify(rules)) as Rule[];
}

interface MonsterOpts {
  coopMult: number;
  hpMult?: number;
  dmgMult?: number;
  isBoss?: boolean;
  isElite?: boolean;
  name?: string;
  /** รอบ 2M: ตั้งท่าทุกเทิร์นที่ N ของตัวเอง (0/undefined = ไม่มีกลไก) */
  windupEvery?: number;
  /** รอบ 2M: สัดส่วนท่าทุบที่ทะลุการตั้งการ์ด */
  windupGuard?: number;
  /** รอบ B: พลังท่าทุบของโซนนี้ (% ของ atk) — ไม่ใส่ = ของสกิลทุบ (mon_crush) */
  windupPower?: number;
}

/**
 * มอน EX ไม่มีช่องของตัวเองใน `Combatant` (PM ล็อก types.ts ไว้) จึงติดธงไว้เป็น
 * field เสริมแบบเดียวกับที่ battle.ts ทำกับ `equipment`/`lifesteal` มาตลอด
 * — ฝั่งที่อ่านคือ battle.ts ตอนแจกดรอป
 */
export type EliteFlagged = Combatant & {
  isElite?: boolean; windupEvery?: number; windupGuard?: number; windupPower?: number;
};

/** true = ตัวนี้คือมอน EX ของรอบนั้น */
export function isElite(c: Combatant): boolean {
  return (c as EliteFlagged).isElite === true;
}

function makeMonster(
  arch: MonsterArchetype,
  level: number,
  id: string,
  opts: MonsterOpts,
): Combatant {
  const stats = scaleStats(arch.stats, level);
  const derived = derivedFromBase(stats, level);
  const hpMult = MONSTER_HP_MULT * (opts.hpMult ?? 1) * opts.coopMult;
  const dmgMult = MONSTER_DMG_MULT * (opts.dmgMult ?? 1) * opts.coopMult;
  derived.maxHp = Math.round(derived.maxHp * hpMult);
  derived.atk = Math.round(derived.atk * dmgMult);
  derived.matk = Math.round(derived.matk * dmgMult);
  const c: EliteFlagged = {
    id,
    name: opts.name ?? arch.nameTh,
    side: 'enemy',
    classId: 'monster',
    level,
    stats,
    derived,
    skills: [...arch.skills],
    rules: cloneRules(gamedata.defaultRules.monsterDefault),
    isBoss: opts.isBoss ?? false,
    monsterId: arch.id,
  };
  // ติดธงเฉพาะตอนเป็น EX จริง — ไม่งั้น JSON ของเวฟเดิมจะเปลี่ยนรูปร่าง
  if (opts.isElite) c.isElite = true;
  // เหตุผลเดียวกัน: โซนที่ไม่มีกลไกต้องได้ JSON หน้าตาเดิมทุกไบต์ (golden fixture ของหอคอย)
  if (opts.windupEvery && opts.windupEvery > 0) {
    c.windupEvery = opts.windupEvery;
    if (opts.windupGuard !== undefined) c.windupGuard = opts.windupGuard;
    if (opts.windupPower !== undefined) c.windupPower = opts.windupPower;
  }
  return c;
}

/**
 * ตัวเลือกของ "โซน" ที่วางทับบนเลขชั้น (รอบ 2W)
 *
 * กฎเหล็ก §2: `floor` ยังเป็นแกนความยากเหมือนเดิม โซนเปลี่ยนแค่ *ใคร* โผล่มา
 * ไม่ได้เปลี่ยน *แรงแค่ไหน* — ค่าที่คูณสเตตัสมอนยังมาจาก gamedata.balance ชุดเดิม
 * ส่งค่าว่าง ({}) แล้วต้องได้ผลเท่ากับหอคอยเดิมเป๊ะ (มี golden fixture คุมอยู่)
 */
export interface WaveBuildSpec {
  /** archetype id ที่โผล่ในโซนนี้ — undefined = สระรวมตาม minFloor เหมือนเดิม */
  pool?: string[];
  /** role ของ "ตัวอันตราย" ที่การันตีต่อเวฟตั้งแต่ชั้น 2 — undefined = 'bruiser' */
  threatRole?: string;
  /** มอน EX ของรอบนี้ (สุ่มไว้ตั้งแต่ตอนกดเข้า) — ไม่เกินหนึ่งตัวต่อรอบ */
  elite?: EliteSpawn | null;
  /** กลไกของโซน (รอบ 2M) — ติดให้มอนตาม archetype ตอนสร้าง ไม่กิน rng */
  mechanic?: RegionMechanic;
}

/** ตัวเลือกกลไกหมายหัวสำหรับ archetype นี้ในโซนนี้ ({} = ไม่มีกลไก) — กระจายลง MonsterOpts ได้ตรง ๆ */
function windupFor(
  spec: WaveBuildSpec, archId: string,
): { windupEvery?: number; windupGuard?: number; windupPower?: number } {
  const m = spec.mechanic;
  if (!m || m.kind !== 'windup' || !m.archetypes.includes(archId)) return {};
  return {
    windupEvery: m.every,
    windupGuard: m.guardMult,
    ...(m.crushPower !== undefined ? { windupPower: m.crushPower } : {}),
  };
}

export function buildWaves(floor: number, partySize: number, seed: number): WaveSpec[] {
  return buildWavesFor(floor, partySize, seed, {});
}

/**
 * เวฟของโซนหนึ่ง — สตรีม rng เป็นสตรีมเดียวกับ buildWaves เป๊ะ
 * (ตั้งใจให้ `buildWavesFor(f, n, s, {})` === `buildWaves(f, n, s)` ตลอดกาล)
 */
export function buildWavesFor(
  floor: number, partySize: number, seed: number, spec: WaveBuildSpec,
): WaveSpec[] {
  const rng: Rng = mulberry32(hashSeed(seed, floor * 101, partySize));
  return buildWavesImpl(floor, partySize, rng, spec);
}

/**
 * บอสของโซน: เลือกบอสที่ archetype ของมันอยู่ในสระของโซน และชั้นใกล้ชั้นปัจจุบันที่สุด
 *
 * ทำไมต้องมีกฎนี้: `RegionDef` ไม่มีช่อง `boss` (types.ts ล็อกอยู่) ถ้าปล่อยตามเดิม
 * ดินแดนน้ำแข็งชั้น 7 จะจบด้วย "ฮาร์ปี้พายุ" ซึ่งไม่มีฮาร์ปี้อยู่ในโซนเลยสักตัว
 * กฎนี้ทำให้บอสมาจากสระของโซนเสมอโดยไม่ต้องเพิ่มข้อมูลใหม่ และขยับความยากแค่
 * ตัวคูณของบอส (hpMult 3.0-4.5) ไม่ได้ขยับเลเวลมอนซึ่งยังมาจาก floor เหมือนเดิม
 */
function bossForFloor(floor: number, poolIds?: string[]): BossDef {
  const fallback =
    gamedata.bosses.find((b) => b.floor === floor) ??
    gamedata.bosses[gamedata.bosses.length - 1];
  if (!poolIds) return fallback;
  const inPool = gamedata.bosses.filter((b) => poolIds.includes(b.archetype));
  if (inPool.length === 0) return fallback;
  return inPool.reduce((best, b) =>
    Math.abs(b.floor - floor) < Math.abs(best.floor - floor) ? b : best);
}

function buildWavesImpl(
  floor: number, partySize: number, rng: Rng, spec: WaveBuildSpec,
): WaveSpec[] {
  const level = monsterLevelForFloor(floor);
  const coopMult = FORMULAS.coopMonsterMult(partySize);
  /**
   * สระของโซนใช้รายชื่อที่โซนประกาศตรง ๆ ไม่กรองด้วย minFloor ซ้ำ
   * เพราะ minFloor คือ "ลำดับการเปิดตัวของหอคอย" ส่วนโซนคือคนประกาศเองว่าที่นี่มีอะไรอยู่
   * (ถ้ากรองซ้ำ หมู่เกาะชั้น 3 จะไม่มีฮาร์ปี้เลย ทั้งที่ฮาร์ปี้คือเหตุผลที่โซนนี้มีอยู่)
   */
  const pool = spec.pool
    ? gamedata.monsterArchetypes.filter((a) => spec.pool!.includes(a.id))
    : gamedata.monsterArchetypes.filter((a) => a.minFloor <= floor);
  const threatRole = spec.threatRole ?? 'bruiser';
  const waves: WaveSpec[] = [];

  for (let w = 1; w <= 10; w++) {
    const monsters: Combatant[] = [];
    if (w === 10) {
      const bossDef = bossForFloor(floor, spec.pool);
      const arch = gamedata.monsterArchetypes.find((a) => a.id === bossDef.archetype)!;
      monsters.push(
        makeMonster(arch, level, `f${floor}w${w}_boss_${bossDef.id}`, {
          coopMult,
          hpMult: bossDef.hpMult,
          dmgMult: bossDef.dmgMult,
          isBoss: true,
          name: bossDef.nameTh,
          ...windupFor(spec, arch.id),
        }),
      );
      if (floor >= 5) {
        const minion = pick(rng, pool);
        monsters.push(makeMonster(minion, level, `f${floor}w${w}_m1_${minion.id}`,
          { coopMult, ...windupFor(spec, minion.id) }));
      }
    } else {
      const count = w <= 3 ? 2 : w <= 6 ? 3 : rngInt(rng, 3, 4);
      /**
       * ตั้งแต่ชั้น 2 ขึ้นไป การันตีว่าทุกเวฟมี "ตัวอันตราย" อย่างน้อยหนึ่งตัว
       * (19 ก.ย. 2026 — เกณฑ์ B1 ใน docs/design-round2p.md §2)
       *
       * ทำไมต้องการันตี ไม่ปล่อยให้สุ่มล้วน: เกมนี้ขาย "การคิด" แต่ผู้เล่นที่เขียน
       * `attack(weakest(enemies))` อย่างเดียวเคยไปได้ถึงชั้น 7 การไล่ความยากขึ้นเฉย ๆ
       * แก้ไม่ได้ เพราะมันทำให้ชั้น 1 ยากตามไปด้วย (วัดแล้ว: ผู้ฝึกหัด lv1 ตกทันที)
       *
       * ตัวอันตรายคือมอนที่ "เลือดเยอะและตีแรง" — `weakest()` จะไม่มีวันเลือกมัน
       * ผู้เล่นที่ตีตัวที่อ่อนที่สุดไปเรื่อย ๆ จึงโดนมันทุบทั้งเวฟ ส่วนคนที่รู้จัก
       * `deadliest()` จะเก็บมันก่อน = ความต่างมาจากการคิด ไม่ใช่จากเลเวล
       * ชั้น 1 ไม่มีตัวแบบนี้ (minFloor 2) เพื่อให้ผู้เล่นใหม่ผ่านด่านแรกได้เสมอ
       *
       * รอบ 2W: role ของตัวอันตรายมาจากโซน (`threatRole`) แทนที่จะฝังว่า 'bruiser'
       * นี่คือปุ่มที่ทำให้โซน "รู้สึกต่าง" จริง ไม่ใช่แค่เปลี่ยนชื่อมอน — ซากปรักหักพัง
       * การันตี caster ทุกเวฟ ตัวที่ต้องเก็บก่อนจึงกลายเป็นตัวที่ deadliest() ไม่เลือก
       * หอคอยไม่ได้ตั้งค่านี้จึงยังเป็น 'bruiser' เหมือนเดิมทุกประการ
       */
      const threats = pool.filter((a) => a.role === threatRole);
      for (let i = 0; i < count; i++) {
        const fromThreats = i === 0 && floor >= 2 && threats.length > 0;
        const arch = pick(rng, fromThreats ? threats : pool);
        monsters.push(makeMonster(arch, level, `f${floor}w${w}_m${i}_${arch.id}`,
          { coopMult, ...windupFor(spec, arch.id) }));
      }
    }
    if (spec.elite && spec.elite.wave === w) {
      injectElite(monsters, spec.elite, level, coopMult, floor, w, windupFor(spec, spec.elite.archetypeId));
    }
    waves.push({ monsters });
  }
  return waves;
}

/**
 * ใส่มอน EX ลงเวฟที่ประกาศไว้ — **แทนที่** มอนธรรมดาตัวแรก ไม่ใช่เพิ่มตัวที่ห้า
 *
 * เหตุผลสองข้อ:
 *  1. จำนวนศัตรูต่อเวฟคือสิ่งที่ผู้เล่นเขียนเงื่อนไขไว้ (`count(enemies) >= 3`)
 *     ถ้า EX ทำให้จำนวนเปลี่ยน โปรแกรมที่เขียนไว้ดีอยู่แล้วจะเปลี่ยนพฤติกรรมโดยไม่ได้ตั้งใจ
 *  2. ช่องที่ถูกแทนคือช่อง "ตัวอันตราย" อยู่แล้ว — EX จึงเข้ามาแทนที่บทบาทเดิม
 *     ความยากขึ้นแบบมีขอบเขต ไม่ใช่ขึ้นแบบทบต้น (กติกา §4: ดวงต้องไม่ตัดสินว่าผ่านไหม)
 *
 * และเพราะการแทนที่ไม่กิน rng เลย เวฟที่เหลือของ seed เดิมจึงเหมือนกันเป๊ะทั้งมีและไม่มี EX
 */
function injectElite(
  monsters: Combatant[], elite: EliteSpawn, level: number,
  coopMult: number, floor: number, wave: number,
  windup: { windupEvery?: number; windupGuard?: number } = {},
): void {
  const arch = gamedata.monsterArchetypes.find((a) => a.id === elite.archetypeId);
  if (!arch) return; // ข้อมูลโซนผิด — ปล่อยให้เวฟเดินต่อดีกว่าล้มทั้งรอบ
  const tuning = gamedata.elite;
  const mon = makeMonster(arch, level, `f${floor}w${wave}_ex_${arch.id}`, {
    coopMult,
    hpMult: tuning.hpMult,
    dmgMult: tuning.dmgMult,
    isElite: true,
    name: elite.nameTh,
    ...windup,
  });
  const slot = monsters.findIndex((m) => !m.isBoss);
  if (slot === -1) monsters.push(mon); // เวฟบอสล้วน (กันไว้ — rollElite ไม่เลือกเวฟ 10)
  else monsters[slot] = mon;
}
