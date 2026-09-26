/**
 * Battle simulation: 10 sequential waves, deterministic.
 *
 * ตัวละครตัดสินใจได้ 2 ทาง:
 *   1. โปรแกรม BloxCode  (ผู้เล่นแนบมากับ Combatant, มอนสเตอร์ดึงจาก gamedata.monsterPrograms)
 *   2. กฎ Gambit เดิม     (ผู้เล่นที่ยัง migrate ไม่เสร็จ)
 * ทางที่ 1 มาก่อนเสมอเมื่อมีโปรแกรม
 */
import { FORMULAS } from './types';
import type {
  BattleResult, Combatant, CombatEvent, DropResult, DuelResult, ItemInstance, SkillDef,
  TargetSelector, WaveSpec,
} from './types';
import { gamedata, getSkill } from './data';
import { hashSeed, mulberry32, variance, type Rng } from './rng';
import { equipmentCombatBonuses } from './stats';
import { NORMAL_EQUIP_DROP_CHANCE, rollItemWithRng } from './drops';
import { buildWaves, isElite } from './waves';
import type { Program } from './lang/spec';
import { parse } from './lang/parser';
import { runTurn, SELF_TARGET, type RuntimeUnit, type TurnContext } from './lang/evaluator';
import { monsterProgramFor } from './lang/monsterAi';

import {
  BASIC_ATTACK_MP, GUARD_MULT, MP_REGEN_PCT, TAUNT_DAMAGE_REDUCTION, TAUNT_ROUNDS, WAVE_CLEAR_RESTORE,
} from './combat-rules';

/** Safety cap: after this many rounds the battle counts as a defeat. */
export const MAX_ROUNDS = 200;
// ค่ากติกาที่ผู้เล่นต้องรู้ (ฟื้น MP · ยั่วยุ · ตั้งการ์ด) อยู่ที่ combat-rules.ts — ข้อความอธิบายบนจออ่านจากที่เดียวกัน

interface Fighter {
  c: Combatant;
  hp: number;
  mp: number;
  shield: number;
  defending: boolean;
  tauntUntil: number; // active while round <= tauntUntil
  lifesteal: number;  // fraction, party-only (from equipment affixes)
  /** จำนวนเทิร์นที่ตัวนี้ได้ลงมือแล้วในการรบนี้ — ใช้นับจังหวะตั้งท่า (รอบ 2M) */
  turnsTaken: number;
  /** id ของคนที่ตัวนี้หมายหัวไว้ — เทิร์นถัดไปของมันจะทุบคนนี้ (null = ไม่ได้ตั้งท่าอยู่) */
  windupTarget: string | null;
}

const alive = (f: Fighter) => f.hp > 0;

/**
 * Party combatants may optionally carry extra fields the contract type does
 * not know about (DerivedStats is frozen): `equipment: ItemInstance[]` and/or
 * precomputed `lifesteal` / `expBonus` fractions. The engine reads them here.
 */
function partyExtras(c: Combatant): { lifesteal: number; expBonus: number } {
  const anyC = c as Combatant & {
    equipment?: ItemInstance[];
    lifesteal?: number;
    expBonus?: number;
  };
  const fromEquip = anyC.equipment ? equipmentCombatBonuses(anyC.equipment) : { lifesteal: 0, expBonus: 0 };
  return {
    lifesteal: anyC.lifesteal ?? fromEquip.lifesteal,
    expBonus: anyC.expBonus ?? fromEquip.expBonus,
  };
}

function makeFighter(c: Combatant, lifesteal: number): Fighter {
  return {
    c,
    hp: c.derived.maxHp,
    mp: c.derived.maxMp,
    shield: 0,
    defending: false,
    tauntUntil: 0,
    lifesteal,
    turnsTaken: 0,
    windupTarget: null,
  };
}

/**
 * กลไกหมายหัว (รอบ 2M — docs/design-round2m.md §2)
 *
 * มอนที่ติดธง `windupEvery` (มาจาก `mechanic` ของโซน ดู waves.ts) ทุกเทิร์นที่ N ของมันจะ
 * **ตั้งท่า** แทนการรันโปรแกรม แล้วเทิร์นถัดไปของมันจะ **ทุบ** คนที่หมายไว้ด้วย `mon_crush`
 *
 * ทำไมตั้งท่ากับทุบห่างกันหนึ่งเทิร์นของ *มอน* ไม่ใช่หนึ่งรอบ: ลำดับเทิร์นเรียงตามความเร็ว
 * ถ้านับเป็นรอบ ผู้เล่นที่ช้ากว่าจะโดนทุบก่อนได้ตัดสินใจ (กติกาข้อ 7 ของรอบ 2S) — นับแบบนี้แล้ว
 * **ผู้เล่นได้ลงมือหนึ่งครั้งพอดีระหว่างตั้งท่ากับทุบเสมอ** ไม่ว่าใครเร็วกว่า
 * (มอนเร็วกว่า: ตั้งท่า → เราตั้งการ์ด → มันทุบรอบหน้าก่อนเราจะได้ลงมืออีก การ์ดยังอยู่)
 *
 * ทำไมเป้าที่หมายไม่ใช้ rng: ตอนเล่นคนเดียวมีเป้าเดียวอยู่แล้ว และการไม่กิน rng ทำให้
 * "มีกลไกไหม" ไม่ไปขยับการสุ่มส่วนอื่นของการรบมากเกินจำเป็น
 */
const WINDUP_SKILL_ID = 'mon_windup';
const CRUSH_SKILL_ID = 'mon_crush';

function windupEveryOf(c: Combatant): number {
  return (c as Combatant & { windupEvery?: number }).windupEvery ?? 0;
}

/** สัดส่วนของท่าทุบที่ทะลุการตั้งการ์ด (ค่าของโซน · ไม่ระบุ = ครึ่งหนึ่งเหมือนการโจมตีปกติ) */
function windupGuardOf(c: Combatant): number {
  return (c as Combatant & { windupGuard?: number }).windupGuard ?? 0.5;
}

function selectTarget(
  sel: TargetSelector,
  actor: Fighter,
  allies: Fighter[],
  enemies: Fighter[],
  rng: Rng,
): Fighter | undefined {
  const le = enemies.filter(alive);
  const la = allies.filter(alive);
  const minBy = (arr: Fighter[], fn: (f: Fighter) => number) =>
    arr.reduce<Fighter | undefined>((best, f) => (!best || fn(f) < fn(best) ? f : best), undefined);
  const maxBy = (arr: Fighter[], fn: (f: Fighter) => number) =>
    arr.reduce<Fighter | undefined>((best, f) => (!best || fn(f) > fn(best) ? f : best), undefined);
  switch (sel) {
    case 'lowest_hp_enemy': return minBy(le, (f) => f.hp);
    case 'highest_hp_enemy': return maxBy(le, (f) => f.hp);
    case 'highest_atk_enemy': return maxBy(le, (f) => f.c.derived.atk);
    case 'random_enemy': return le.length ? le[Math.floor(rng() * le.length)] : undefined;
    case 'self': return actor;
    case 'lowest_hp_ally': return minBy(la, (f) => f.hp);
  }
}

function conditionHolds(
  type: string,
  value: number | undefined,
  actor: Fighter,
  allies: Fighter[],
  enemies: Fighter[],
  round: number,
): boolean {
  const v = value ?? 0;
  const hpPct = (f: Fighter) => (f.hp / f.c.derived.maxHp) * 100;
  switch (type) {
    case 'always': return true;
    case 'self_hp_below': return hpPct(actor) < v;
    case 'self_mp_above': return (actor.mp / actor.c.derived.maxMp) * 100 > v;
    case 'ally_hp_below': return allies.filter(alive).some((f) => hpPct(f) < v);
    case 'enemy_count_gte': return enemies.filter(alive).length >= v;
    case 'enemy_hp_below': return enemies.filter(alive).some((f) => hpPct(f) < v);
    case 'turn_gte': return round >= v;
    default: return false;
  }
}

type Resolved =
  | { kind: 'basic'; target: Fighter }
  | { kind: 'defend' }
  | { kind: 'wait' }
  | { kind: 'skill'; skill: SkillDef; target: Fighter };

/** ผลการตัดสินใจ 1 เทิร์น + ข้อมูลที่มาจากโปรแกรม (ถ้าขับด้วย BloxCode) */
interface Decision {
  resolved?: Resolved;
  /** บรรทัดที่ตัดสินใจ — client ใช้ไฮไลต์โค้ดตอนเล่นฉากต่อสู้ */
  line?: number;
  warnings?: string[];
}

function resolveAction(
  actor: Fighter,
  allies: Fighter[],
  enemies: Fighter[],
  round: number,
  rng: Rng,
): Resolved | undefined {
  for (const rule of actor.c.rules) {
    if (!conditionHolds(rule.condition.type, rule.condition.value, actor, allies, enemies, round)) {
      continue;
    }
    const act = rule.action;
    if (act.type === 'defend') return { kind: 'defend' };
    if (act.type === 'attack') {
      let target = selectTarget(act.target, actor, allies, enemies, rng);
      // An attack must hit an enemy; nonsensical selectors fall back to random enemy.
      if (!target || target.c.side === actor.c.side) {
        target = selectTarget('random_enemy', actor, allies, enemies, rng);
      }
      if (target) return { kind: 'basic', target };
      continue;
    }
    // skill: a monster skill action with no skillId uses the monster's first skill
    const skillId = act.skillId ?? actor.c.skills[0];
    if (!skillId) continue;
    const skill = getSkill(skillId);
    if (!skill) continue;
    if (!actor.c.skills.includes(skillId)) continue; // unusable — not learned
    if (actor.mp < skill.mpCost) continue;           // insufficient MP → next rule
    const wantsAlly = skill.kind === 'heal' || skill.kind === 'shield' || skill.kind === 'taunt';
    let target = selectTarget(act.target, actor, allies, enemies, rng);
    if (!target || (wantsAlly && target.c.side !== actor.c.side)) {
      target = wantsAlly ? actor : selectTarget('random_enemy', actor, allies, enemies, rng);
    }
    if (!wantsAlly && target && target.c.side === actor.c.side) {
      target = selectTarget('random_enemy', actor, allies, enemies, rng);
    }
    if (!target) continue;
    return { kind: 'skill', skill, target };
  }
  // No rule fired → basic attack a random enemy.
  const fallback = selectTarget('random_enemy', actor, allies, enemies, rng);
  return fallback ? { kind: 'basic', target: fallback } : undefined;
}

// ---------------------------------------------------------------- BloxCode
/**
 * Combatant อาจพก BloxCode มาด้วย โดยไม่ต้องแก้ type ที่ PM ล็อกไว้
 * (วิธีเดียวกับ `equipment` / `lifesteal` ด้านบน):
 *   program?: Program        — AST ที่ parse มาแล้ว (เร็วสุด server ควรใช้ทางนี้)
 *   programSource?: string   — ข้อความ Python ดิบ (parse ให้ + แคชตามข้อความ)
 * มอนสเตอร์ไม่ต้องแนบอะไร — ดึงจาก gamedata.monsterPrograms ตาม role
 */
const sourceCache = new Map<string, Program | null>();

function programOf(c: Combatant): Program | undefined {
  const anyC = c as Combatant & { program?: Program; programSource?: string };
  if (anyC.program) return anyC.program;
  if (typeof anyC.programSource === 'string') {
    const key = anyC.programSource;
    if (!sourceCache.has(key)) sourceCache.set(key, parse(key).program);
    // โปรแกรมพังไม่ควรทำให้รบไม่ได้ — ถอยไปใช้ rules เดิม
    return sourceCache.get(key) ?? undefined;
  }
  if (c.side === 'enemy') return monsterProgramFor(c.monsterId);
  return undefined;
}

function toRuntimeUnit(f: Fighter): RuntimeUnit {
  const d = f.c.derived;
  return {
    id: f.c.id,
    hp: f.hp,
    maxHp: d.maxHp,
    mp: f.mp,
    maxMp: d.maxMp,
    level: f.c.level,
    atk: d.atk,
    matk: d.matk,
    def: d.def,
    mdef: d.mdef,
    speed: d.speed,
  };
}

function weakestOf(list: Fighter[]): Fighter | undefined {
  return list.reduce<Fighter | undefined>((best, f) => (!best || f.hp < best.hp ? f : best), undefined);
}

function decideFromProgram(
  program: Program,
  actor: Fighter,
  allies: Fighter[],
  enemies: Fighter[],
  round: number,
  rng: Rng,
): Decision {
  const livingAllies = allies.filter(alive);
  const livingEnemies = enemies.filter(alive);
  const buffs: string[] = [];
  if (actor.tauntUntil >= round) buffs.push('taunt');
  if (actor.shield > 0) buffs.push('shield');
  const debuffs: string[] = [];
  // รอบ 2M: มีศัตรูที่ยังไม่ตายตั้งท่าเล็งเราอยู่ = เทิร์นหน้าของมันจะทุบเรา
  if (enemies.some((e) => alive(e) && e.windupTarget === actor.c.id)) debuffs.push('marked');

  const ctx: TurnContext = {
    me: toRuntimeUnit(actor),
    enemies: livingEnemies.map(toRuntimeUnit),
    allies: livingAllies.map(toRuntimeUnit),
    turn_no: round,
    rng,
    availableSkills: actor.c.skills,
    buffs,
    debuffs,
  };

  const d = runTurn(program, ctx);
  const out: Decision = { line: d.line };
  if (d.warnings && d.warnings.length) out.warnings = d.warnings;

  const byId = (id?: string): Fighter | undefined => {
    if (id === undefined) return undefined;
    if (id === SELF_TARGET) return actor;
    return [...livingAllies, ...livingEnemies].find((f) => f.c.id === id);
  };

  if (d.action === 'wait') {
    out.resolved = { kind: 'wait' };
    return out;
  }
  if (d.action === 'defend') {
    out.resolved = { kind: 'defend' };
    return out;
  }
  if (d.action === 'skill' && d.skillId) {
    const skill = getSkill(d.skillId);
    if (skill && actor.c.skills.includes(skill.id) && actor.mp >= skill.mpCost) {
      const wantsAlly = skill.kind === 'heal' || skill.kind === 'shield' || skill.kind === 'taunt';
      let target = byId(d.targetId);
      if (wantsAlly) {
        if (!target || target.c.side !== actor.c.side) target = actor;
      } else if (!target || target.c.side === actor.c.side) {
        // AoE ไม่ต้องระบุเป้า, ส่วนเป้าที่ผิดฝั่งให้เล็งตัวที่ HP น้อยสุดแทน (ไม่กิน rng)
        target = weakestOf(livingEnemies);
      }
      if (target) {
        out.resolved = { kind: 'skill', skill, target };
        return out;
      }
    }
  }
  // attack (และกรณีสกิลใช้ไม่ได้จริง ๆ) → ตีเป้าที่ระบุ ถ้าไม่สมเหตุสมผลใช้ตัวที่ HP น้อยสุด
  let target = byId(d.targetId);
  if (!target || target.c.side === actor.c.side) target = weakestOf(livingEnemies);
  if (target) out.resolved = { kind: 'basic', target };
  return out;
}

function decide(
  actor: Fighter,
  allies: Fighter[],
  enemies: Fighter[],
  round: number,
  rng: Rng,
): Decision {
  const program = programOf(actor.c);
  if (program) return decideFromProgram(program, actor, allies, enemies, round, rng);
  return { resolved: resolveAction(actor, allies, enemies, round, rng) };
}

/** Redirect single-target offense to an active taunter on the defending side. */
function applyTaunt(target: Fighter, defenders: Fighter[], round: number): Fighter {
  const taunter = defenders.find((f) => alive(f) && f.tauntUntil >= round);
  return taunter ?? target;
}

interface HitResult {
  entry: CombatEvent['targets'][number];
  damageDealt: number;
  killed: boolean;
}

function dealDamage(
  attacker: Fighter,
  target: Fighter,
  kind: 'physical' | 'magic',
  power: number,
  singleTarget: boolean,
  rng: Rng,
  /** รอบปัจจุบัน — ใช้ตรวจว่าเป้าหมายกำลังยั่วยุอยู่ไหม (ยั่วยุ = ตั้งรับด้วย) */
  round: number,
  /**
   * สัดส่วนดาเมจที่ทะลุการตั้งการ์ด (ปกติครึ่งหนึ่ง) — รอบ 2M: ท่าทุบของกลไกหมายหัวใช้ค่าของโซน
   * เพราะ "ทำถูกจังหวะ" ต้องคุ้มจริง ถ้าตั้งการ์ดแล้วยังเจ็บครึ่งหนึ่ง คนที่อ่านจังหวะเป็นก็โดนลงโทษไปด้วย
   * (0.5 ให้ผลเท่า `/ 2` เดิมทุกค่า — golden fixture คุมอยู่)
   */
  guardMult = GUARD_MULT,
): HitResult {
  const ad = attacker.c.derived;
  const td = target.c.derived;

  // Evasion applies only to single-target physical attacks.
  if (singleTarget && kind === 'physical' && rng() < td.evasion) {
    return {
      entry: { id: target.c.id, name: target.c.name, damage: 0, evaded: true, hpAfter: target.hp },
      damageDealt: 0,
      killed: false,
    };
  }

  const varMult = variance(rng);
  let dmg = kind === 'physical'
    ? FORMULAS.physicalDamage(ad.atk, power, td.def, varMult)
    : FORMULAS.magicDamage(ad.matk, power, td.mdef, varMult);

  const crit = rng() < ad.critRate;
  if (crit) dmg = Math.round(dmg * ad.critDmg);
  if (target.defending) dmg = Math.max(1, Math.round(dmg * guardMult));
  // คนที่กำลังยั่วยุอยู่ = กำลังตั้งรับ จึงกินดาเมจน้อยลงด้วย (ดู TAUNT_DAMAGE_REDUCTION)
  if (target.tauntUntil >= round) {
    dmg = Math.max(1, Math.round(dmg * (1 - TAUNT_DAMAGE_REDUCTION)));
  }

  // Shield absorbs before HP.
  const absorbed = Math.min(target.shield, dmg);
  target.shield -= absorbed;
  target.hp = Math.max(0, target.hp - (dmg - absorbed));
  const killed = target.hp <= 0;

  // Lifesteal heals the attacker by a fraction of damage dealt.
  if (attacker.lifesteal > 0 && dmg > 0) {
    const heal = Math.round(dmg * attacker.lifesteal);
    attacker.hp = Math.min(ad.maxHp, attacker.hp + heal);
  }

  return {
    entry: { id: target.c.id, name: target.c.name, damage: dmg, crit, killed, hpAfter: target.hp },
    damageDealt: dmg,
    killed,
  };
}

interface KillRecord { level: number; isBoss: boolean; isElite: boolean }

/**
 * ประทับ MP จริงของผู้ลงมือลงใน event ของเทิร์นนั้น (playtest รอบ A ข้อ 4 · 26 ก.ย. 2026)
 *
 * เดิม event ไม่มี MP ฉากจึงเดาเองด้วยการ "หักค่าร่ายอย่างเดียว" แต่ตัวรบจริงคืน MP ทุกเทิร์น
 * (MP_REGEN_PCT) ตอนตีธรรมดา (BASIC_ATTACK_MP) และตอนเคลียร์เวฟ ผลคือหลอด MP บนจอหมด
 * ทั้งที่จริงยังเหลือ แล้วผู้เล่นเห็นตัวละครร่ายต่อ = ดูเหมือนบั๊ก "MP หมดยังใช้สกิลได้"
 * (วัดได้: จอมเวท lv1 ร่ายลูกไฟจริง 22 ครั้ง จอบอกว่าไม่พอตั้งแต่ครั้งที่ 10)
 *
 * ค่าที่ประทับ = หลังหักค่าร่ายและฟื้นตอนจบเทิร์นแล้ว = ค่าที่ `me.mp` ของเทิร์นถัดไปเห็น
 * (ก่อนการฟื้นตอนเคลียร์เวฟ ถ้าเวฟจบระหว่างนั้น) · ไม่แตะ rng และไม่เปลี่ยนค่าใดของการรบ
 */
function stampMp(events: CombatEvent[], from: number, actor: Fighter): void {
  for (let i = from; i < events.length; i++) {
    if (events[i].actorId === actor.c.id) events[i].mpAfter = actor.mp;
  }
}

/**
 * ตัวคูณรางวัลของ "เนื้อหาที่ต่ำกว่าตัวเรามาก" (รอบ 2F §3.1 ข้อ 1 — คันโยกที่ใหญ่ที่สุด)
 *
 * **ปัญหาที่แก้อยู่** รอบ 2T วัดได้ว่าวงจรของคนไม่คิดคือ "แพ้ → ถอยไปฟาร์มชั้นเก่า →
 * กลับมาชนะ" และมันได้ผลเพราะชั้นเก่าจ่ายเท่าเดิมตลอดกาล — ฟาร์มชั้น 1 ตอนเลเวล 11
 * ได้ 496 EXP เท่ากับตอนเลเวล 1 เป๊ะ เวลาที่ลงไปจึงแปลงเป็นความคืบหน้าได้เสมอ
 * โดยไม่ต้องแก้โค้ดแม้แต่บรรทัดเดียว (docs/measurements/playtest-2t.txt ข้อ [1])
 *
 * **ทำไมวัดด้วยเลเวลของมอน ไม่ใช่เลขชั้น** เพราะ engine ไม่รู้จัก "ชั้นสูงสุดที่เคยผ่าน"
 * ของผู้เล่น (มันอยู่ในฐานข้อมูลของเซิร์ฟเวอร์) และการส่งเข้ามาเพิ่มจะทำให้ทางเข้าสามทาง
 * (หอคอย · โซน · ดวล) ต้องรู้เรื่องเดียวกันหมด · เลเวลมอนคือ floor*2 อยู่แล้ว
 * (`monsterLevelForFloor`) มันจึงเป็นตัวแทนของ "ชั้นนี้ลึกแค่ไหน" ที่ engine มีอยู่ในมือ
 * และยังใช้ได้กับเวฟของโซนที่ผสมเลเวลกันในอนาคตโดยไม่ต้องแก้อะไร
 *
 * **ที่มาของ freeGap = 2** เลเวลมอน = ชั้น × 2 หนึ่งชั้นจึงเท่ากับสองเลเวลเสมอ
 * freeGap 2 = "ชั้นที่ต่ำกว่าตัวเราหนึ่งชั้นยังจ่ายเต็ม" · วัดด้วย `tools/lazyprobe.cjs`
 * จากชีวิตจริง 24 ชีวิต: ตอน *ท้าชั้นถัดไป* ผู้เล่นอยู่เหนือเลเวลมอน 0-3 (ชั้น 7 ที่ lv14
 * · ชั้น 8 ที่ lv18 · ชั้น 10 ที่ lv20) ส่วนตอน *ถอยไปฟาร์ม* อยู่ที่ 2-5 ขึ้นไป
 * คนที่เล่นไปข้างหน้าจึงแทบไม่โดน ส่วนคนที่ถอยหลังโดนทุกครั้งที่เลเวลทิ้งเนื้อหาไว้ข้างหลัง
 *
 * **ทำไมต้องมี graceLevel = 10 (ต้นเกมไม่คิดตัวคูณนี้เลย)** นี่คือสิ่งที่การวัดสอน
 * และเดาไม่ได้: ต้นเกมมีเศรษฐกิจ EXP ของตัวเอง — ชนะชั้น 1 ครั้งเดียวพาจาก lv1 ไป lv5
 * (ตั้งใจให้เป็นแบบนั้น: `expToNext` ของ lv1-4 รวมกันแค่ 483) ผู้เล่นจึงอยู่เหนือเลเวลมอน
 * ของชั้น 1-2 ตั้งแต่วินาทีแรกโดยไม่ได้ฟาร์มอะไรเลย · ฉบับแรกของการแก้นี้ไม่มี grace
 * แล้ววัดได้ว่า **คนที่เขียนโค้ดเป็นก็ตันที่ชั้น 2 ไปด้วย 4 ใน 12 ชีวิต** เพราะเพดาน
 * ของการฟาร์มชั้น 1 ไปตกที่ lv8 พอดี ขณะที่ชั้น 2 ต้องการ lv9 = ตันถาวรทั้งที่ไม่ได้ผิดอะไร
 * ซึ่งผิดทั้ง §2 (ลงโทษทุกคนเท่ากัน) และ F2 · grace 10 ตัดปัญหานั้นทิ้งทั้งก้อน
 * โดยไม่ทำให้คันโยกอ่อนลงเลย เพราะการฟาร์มที่เป็นปัญหาเกิดที่ lv12 ขึ้นไปทั้งหมด
 *
 * **ทำไม 0.5 ต่อเลเวล (= เหลือ 1/4 ต่อชั้นที่ถอยลงไป)** กวาด 0.5-0.8 × freeGap 0-4
 * × grace 0-14 ด้วย `lazyprobe.cjs sweep` ผลไม่ใช่ความชันที่ค่อย ๆ เปลี่ยน แต่เป็นระบบ
 * สองสถานะ: ที่ 0.6-0.8 การฟาร์มยังไล่ทันเส้นความยาก คนไม่คิด "จบเกม" เหมือนเดิม
 * (แค่ใช้เวลามากขึ้น 34 → 68 การรบ ซึ่งแก้ไม่ตรงโจทย์ — §1 บอกว่าเกมยากขึ้นเฉย ๆ
 * แก้ไม่ได้เพราะคนไม่คิดจะแค่ฟาร์มนานขึ้น) พอข้ามจุดพลิกที่ราว 0.55-0.6 การฟาร์ม
 * ไล่ไม่ทัน แล้วคนไม่คิดตันที่เพดานของโปรแกรมตัวเองทันที · เลือก 0.5 ไม่ใช่ 0.55
 * เพราะ 0.55 อยู่ติดจุดพลิกเกินไป — รอบหน้าขยับอย่างอื่นนิดเดียวก็พลิกกลับโดยไม่มีใครรู้ตัว
 *
 * **ผลที่วัดได้ ณ ค่าชุดนี้** (24 ชีวิตต่อกลุ่ม · `npm run lazyprobe -w engine`)
 *   ไม่คิดเลย (บรรทัดเดียว)          ตันชั้น 4 ที่ lv12 · 39 การรบ · จบเกมได้ 4/24
 *   คิดนิดเดียว (if + deadliest)     ตันชั้น 9 ที่ lv21 · 41 การรบ · จบเกมได้ 10/24
 *   แก้โค้ดตามที่ปลดล็อก             จบเกม 24/24 ที่ lv18 · 17 การรบ
 * และเกณฑ์ F2 ผ่านตรงตัว: คนที่คิดผ่านชั้น 4 ตั้งแต่ **lv10 การรบที่ 7** ส่วนคนไม่คิด
 * ตันที่ชั้นเดียวกันที่ lv12 การรบที่ 35 — ชั้นเดียวกัน เลเวลต่ำกว่า เวลาน้อยกว่าห้าเท่า
 *
 * **ไม่ใช่การเพิ่มความยาก** (กฎเหล็ก §2) — มอนไม่ได้แรงขึ้นแม้แต่จุดเดียว
 * สิ่งที่เปลี่ยนคือความสัมพันธ์ระหว่าง "เวลาที่ลงไป" กับ "ความคืบหน้า" ตามที่ §2 สั่ง
 */
function rewardFalloff(topLevel: number, monsterLevel: number): number {
  const b = gamedata.balance;
  // ช่วงต้นเกมไม่คิดตัวคูณนี้เลย — ดูย่อหน้า "ทำไมต้องมี graceLevel" ข้างบน
  if (topLevel <= b.farmFalloffGraceLevel) return 1;
  const gap = topLevel - monsterLevel - b.farmFalloffFreeGap;
  if (gap <= 0) return 1;
  return Math.max(b.farmFalloffMin, Math.pow(b.farmFalloffPerLevel, gap));
}

/**
 * ตัวคูณรางวัลตอนแพ้ — แปรตามสัดส่วนเวฟที่ผ่าน (รอบ 2F §3.1 ข้อ 2)
 *
 * เดิมแพ้ได้รางวัลของทุกตัวที่ฆ่าได้แบบเต็ม ๆ (แพ้ชั้น 8 ได้ 1,728 · ชนะได้ 2,203)
 * "การแพ้จึงกลายเป็นวิธีฟาร์มที่ดีที่สุด ไม่ใช่สัญญาณว่าต้องแก้โค้ด"
 *
 * ที่นี่ไม่ได้ลงโทษการแพ้ — `defeatRewardMin` ต้องไม่เป็นศูนย์เด็ดขาด (§3.1 ห้ามไว้
 * ตรง ๆ เพราะผู้เล่นคือเด็กที่หัดเขียนโปรแกรม การลงโทษความล้มเหลวสอนให้เลิกลอง)
 * สิ่งที่เพิ่มเข้ามาคือ *ความชัน*: แพ้เวฟ 2 กับแพ้เวฟ 9 ต้องไม่เท่ากัน เพราะอย่างหลัง
 * คือ "เกือบแล้ว" ซึ่งแปลว่าโปรแกรมดีขึ้นจริง และเกมควรบอกผู้เล่นว่ามันเห็น
 *
 * ผลรวมกับจำนวนตัวที่ฆ่าได้ทำให้ความต่างคมกว่าตัวเลขนี้มาก: แพ้ตั้งแต่เวฟ 1
 * ได้มอนเวฟเดียว × 0.24 ส่วนแพ้เวฟ 9 ได้มอนเก้าเวฟ × 0.56 = ต่างกันราว 20 เท่า
 */
function defeatRewardMult(wavesCleared: number, waveCount: number): number {
  const b = gamedata.balance;
  const ratio = waveCount > 0 ? Math.min(1, Math.max(0, wavesCleared / waveCount)) : 0;
  return b.defeatRewardMin + (b.defeatRewardMax - b.defeatRewardMin) * ratio;
}

/**
 * ตัวเลือกของการจำลองหนึ่งครั้ง
 *
 * ทำไมถึงมีอยู่ (รอบ 2W): เวฟดวลและการลงโซนต้องใช้ "เครื่องจำลองตัวเดียวกันเป๊ะ" กับ
 * การไต่หอคอย ถ้าเขียนลูปที่สองขึ้นมา ผลของสองทางจะเริ่มแตกกันวันใดวันหนึ่ง
 * แล้วเทสต์ balance ทั้งชุดจะวัดของที่ผู้เล่นไม่ได้เล่น
 */
export interface SimOptions {
  /** ชั้นความยาก — ยังเป็นแกนเดิมตามกฎเหล็ก §2 และเป็นชั้นที่ใช้สุ่มของ */
  floor: number;
  seed: number;
  /** สตรีมสุ่มของการรบ — ผู้เรียกเป็นคนสร้างเพื่อคุมความ deterministic เอง */
  rng: Rng;
  /** รอบสูงสุดก่อนถือว่าแพ้ (เวฟดวลใช้ค่าสั้นกว่ามาก) */
  maxRounds?: number;
  /** ตัวคูณรางวัล · 0 = ไม่แจกของเลยและไม่กิน rng ของการสุ่มของ (เวฟดวล) */
  rewardMult?: number;
}

/**
 * เครื่องจำลองกลาง — ไล่เวฟตามลำดับจนกว่าจะหมดเวฟหรือปาร์ตี้ตาย
 *
 * `runBattle` ด้านล่างคือตัวเดิมทุกประการ เพียงแต่ย้ายเนื้อในมาไว้ที่นี่เพื่อให้
 * runRegionBattle/runDuel ใช้ร่วมกันได้ · ความเหมือนเป๊ะของ runBattle ถูกคุมด้วย
 * golden fixture (engine/test/fixtures/battle-golden.json) ที่สร้างจาก build ก่อนย้าย
 */
export function simulateWaves(
  party: Combatant[], waves: WaveSpec[], opts: SimOptions,
): BattleResult {
  const { floor, seed, rng } = opts;
  const maxRounds = opts.maxRounds ?? MAX_ROUNDS;
  const rewardMult = opts.rewardMult ?? 1;
  const waveCount = waves.length;

  const events: CombatEvent[] = [];
  const kills: KillRecord[] = [];
  const partyFighters = party.map((c) => makeFighter(c, partyExtras(c).lifesteal));
  const partyAlive = () => partyFighters.some(alive);

  let round = 0;
  let wavesCleared = 0;
  let victory = false;
  let capped = false;

  const recordKillIfEnemy = (f: Fighter, wasAlive: boolean) => {
    if (wasAlive && !alive(f) && f.c.side === 'enemy') {
      kills.push({ level: f.c.level, isBoss: !!f.c.isBoss, isElite: isElite(f.c) });
    }
  };

  outer:
  for (let w = 1; w <= waveCount; w++) {
    const enemyFighters = waves[w - 1].monsters.map((m) => makeFighter(m, 0));
    const enemiesAlive = () => enemyFighters.some(alive);
    /**
     * รอบ 2M (แก้หลังเกณฑ์ M4 ล้มผลได้): จังหวะตั้งท่า *ครั้งแรก* ของแต่ละตัวสุ่มจากสตรีมการรบ
     *
     * ฉบับแรกนับจากต้นเวฟเหมือนกันทุกตัว โกเลมทุกตัวจึงตั้งท่าที่รอบ 3, 6, 9 ของเวฟพร้อมกัน
     * เอเจนต์ที่ได้รับคำสั่งให้ล้มผลเขียนโปรแกรมที่ **ไม่ใช้ has_debuff เลย** แต่นับ turn_no
     * แล้วคุมให้ศัตรูตัวสุดท้ายของเวฟตายในรอบที่หาร 3 ลงตัว ได้เลเวลขั้นต่ำเท่าโปรแกรมที่อ่าน
     * has_debuff ทุกอาชีพ (docs/playtest/m4-adversarial.md) — กลไกที่เดาจากนาฬิกาได้ ไม่ได้สอน
     * ให้ "ดูสถานการณ์" มันสอนให้ท่องตารางเวลา
     *
     * **สุ่มครั้งเดียวต่อเวฟ ไม่ใช่ต่อตัว** — ฉบับที่สองสุ่มแยกทีละตัว แล้ววัดได้ว่าโกเลมสามสี่ตัว
     * ผลัดกันตั้งท่าจนผู้เล่นถูกหมายหัวเกือบตลอด ต้องตั้งการ์ดครึ่งหนึ่งของเทิร์น การรบลากยาว
     * จนชนเพดาน 200 รอบ คนที่อ่านจังหวะถูกต้องกลับโดนหนักขึ้น 2-4 เลเวล (ผิดเกณฑ์ M2)
     * สุ่มต่อเวฟ = โกเลมทั้งเวฟยังตั้งท่าพร้อมกัน (ตั้งการ์ดครั้งเดียวรับได้ทุกตัว) แต่เวฟไหน
     * เริ่มจังหวะไหนเดาจากนาฬิกาไม่ได้แล้ว
     *
     * สุ่มเฉพาะเวฟที่มีตัวที่มีกลไก จึงไม่กิน rng ของโซนอื่นเลย (หอคอยตรงกับ golden fixture เหมือนเดิม)
     * ยังยุติธรรมอยู่: ไม่ว่าจะเริ่มที่จังหวะไหน ผู้เล่นได้ลงมือหนึ่งครั้งก่อนโดนทุบเสมอ
     */
    const windupEvery = enemyFighters.reduce((m, f) => Math.max(m, windupEveryOf(f.c)), 0);
    if (windupEvery > 0) {
      const offset = Math.floor(rng() * windupEvery);
      for (const f of enemyFighters) if (windupEveryOf(f.c) > 0) f.turnsTaken = offset;
    }

    events.push({
      turn: round + 1,
      wave: w,
      actorId: 'system',
      actorName: 'system',
      action: 'attack',
      // roster of the wave's monsters with starting HP — client draws HP bars from this
      targets: enemyFighters.map((f) => ({
        id: f.c.id, name: f.c.name, hpAfter: f.hp,
      })),
      note: 'wave_start',
    });

    while (true) {
      round++;
      if (round > maxRounds) { capped = true; break outer; }

      // Turn order: all living combatants, descending speed, rng tiebreak.
      const order = [...partyFighters, ...enemyFighters]
        .filter(alive)
        .map((f) => ({ f, tb: rng() }))
        .sort((a, b) => b.f.c.derived.speed - a.f.c.derived.speed || a.tb - b.tb)
        .map((x) => x.f);

      for (const actor of order) {
        if (!alive(actor)) continue;
        if (!enemiesAlive() || !partyAlive()) break;
        actor.defending = false; // 'defend' lasts until the actor's next turn
        /** event แรกของเทิร์นนี้ — ใช้ประทับ mpAfter ตอนจบเทิร์น (ดู stampMp) */
        const turnStart = events.length;

        const isParty = actor.c.side === 'party';
        const allies = isParty ? partyFighters : enemyFighters;
        const enemies = isParty ? enemyFighters : partyFighters;

        const d = actor.c.derived;

        // ---- รอบ 2M: กลไกหมายหัว — มาก่อนโปรแกรมของมอน (ดูคำอธิบายที่ windupEveryOf)
        const every = windupEveryOf(actor.c);
        if (every > 0) {
          const markedId = actor.windupTarget;
          actor.windupTarget = null;
          const marked = markedId ? enemies.find((f) => f.c.id === markedId && alive(f)) : undefined;
          let forced = false;
          if (marked) {
            // ทุบ — คนที่ถูกหมายตายไปแล้ว (หรือไม่อยู่) = ไม่ทุบ ทำตามโปรแกรมตามปกติ
            const crush = getSkill(CRUSH_SKILL_ID)!;
            const target = applyTaunt(marked, enemies, round);
            const wasAlive = alive(target);
            const hit = dealDamage(actor, target, 'physical', crush.power, true, rng, round,
              windupGuardOf(actor.c));
            recordKillIfEnemy(target, wasAlive);
            events.push({
              turn: round, wave: w, actorId: actor.c.id, actorName: actor.c.name,
              action: 'skill', skillId: crush.id, targets: [hit.entry],
            });
            forced = true;
          } else if ((actor.turnsTaken + 1) % every === 0) {
            const mark = weakestOf(enemies.filter(alive));
            if (mark) {
              actor.windupTarget = mark.c.id;
              events.push({
                turn: round, wave: w, actorId: actor.c.id, actorName: actor.c.name,
                action: 'skill', skillId: WINDUP_SKILL_ID, note: 'windup',
                targets: [{ id: mark.c.id, name: mark.c.name, hpAfter: mark.hp }],
              });
              forced = true;
            }
          }
          if (forced) {
            actor.turnsTaken++;
            actor.mp = Math.min(d.maxMp, actor.mp + Math.round(d.maxMp * MP_REGEN_PCT));
            stampMp(events, turnStart, actor);
            continue;
          }
        }

        const decision = decide(actor, allies, enemies, round, rng);
        const resolved = decision.resolved;
        /** field เสริมของ CombatEvent สำหรับตัวที่ขับด้วย BloxCode */
        const codeMeta: Pick<CombatEvent, 'line' | 'codeWarnings'> = {
          ...(decision.line !== undefined ? { line: decision.line } : {}),
          ...(decision.warnings ? { codeWarnings: decision.warnings } : {}),
        };

        if (resolved && resolved.kind !== 'wait') {
          if (resolved.kind === 'defend') {
            actor.defending = true;
            events.push({
              turn: round, wave: w, actorId: actor.c.id, actorName: actor.c.name,
              action: 'defend', targets: [], note: 'defend', ...codeMeta,
            });
          } else if (resolved.kind === 'basic') {
            const target = applyTaunt(resolved.target, enemies, round);
            const wasAlive = alive(target);
            const hit = dealDamage(actor, target, 'physical', 100, true, rng, round);
            recordKillIfEnemy(target, wasAlive);
            actor.mp = Math.min(d.maxMp, actor.mp + BASIC_ATTACK_MP);
            events.push({
              turn: round, wave: w, actorId: actor.c.id, actorName: actor.c.name,
              action: 'attack', targets: [hit.entry], ...codeMeta,
            });
          } else {
            const { skill } = resolved;
            actor.mp -= skill.mpCost;
            const targets: CombatEvent['targets'] = [];

            if (skill.kind === 'physical' || skill.kind === 'magic') {
              if (skill.aoe) {
                for (const t of enemies.filter(alive)) {
                  const wasAlive = alive(t);
                  const hit = dealDamage(actor, t, skill.kind, skill.power, false, rng, round);
                  recordKillIfEnemy(t, wasAlive);
                  targets.push(hit.entry);
                }
              } else {
                const target = applyTaunt(resolved.target, enemies, round);
                const wasAlive = alive(target);
                const hit = dealDamage(actor, target, skill.kind, skill.power, true, rng, round);
                recordKillIfEnemy(target, wasAlive);
                targets.push(hit.entry);
              }
            } else if (skill.kind === 'heal') {
              const t = resolved.target;
              /**
               * ฮีลคิดจาก "เลือดสูงสุดของเป้าหมาย" ไม่ใช่ matk (แก้ 19 ก.ย. 2026)
               *
               * เดิมคิดจาก matk ซึ่งแปลว่าจอมเวทที่อัด INT ได้ทั้งดาเมจและการฮีลพร้อมกัน
               * ผลคือเลเวลหยุดมีความหมายตั้งแต่กลางเกม — วัดได้ว่าจอมเวทผ่านชั้น 5 ถึง 10
               * ได้ที่เลเวล 7 เท่ากันหมด (เกณฑ์ B4 ตก) เพราะฮีลโตเร็วกว่าดาเมจของมอน
               *
               * ตอนนี้ฮีลเป็น "สัดส่วนของหลอดเลือด" คงที่ ตัวจำกัดจริงจึงเป็น MP
               * ซึ่งเป็นตัวบีบที่บังคับให้ต้องเขียนเงื่อนไข ไม่ใช่กำแพงที่อัดสเตตัวเดียวแล้วผ่าน
               * (สกิลชนิด heal/shield อ่าน power ว่า "% ของเลือดสูงสุด" เหมือนกัน)
               */
              const amount = Math.round(t.c.derived.maxHp * (skill.power / 100));
              const healed = Math.min(amount, t.c.derived.maxHp - t.hp);
              t.hp += healed;
              targets.push({ id: t.c.id, name: t.c.name, heal: healed, hpAfter: t.hp });
            } else if (skill.kind === 'shield') {
              const t = resolved.target;
              /**
               * โล่คิดจาก "เลือดสูงสุดของผู้ร่าย" ไม่ใช่ matk (แก้ 19 ก.ย. 2026)
               * เดิมคิดจาก matk ซึ่งผู้พิทักษ์ไม่มี — ปราการของผู้พิทักษ์ lv15
               * กันได้ 25 หน่วยจากหลอด 908 (2.7%) คือแทบไม่มีอยู่จริง
               * ตอนนี้ power อ่านว่า "% ของเลือดสูงสุด" สำหรับสกิลชนิด shield
               */
              const points = Math.round(d.maxHp * (skill.power / 100));
              t.shield += points;
              targets.push({ id: t.c.id, name: t.c.name, shield: points, hpAfter: t.hp });
            } else if (skill.kind === 'taunt') {
              actor.tauntUntil = round + TAUNT_ROUNDS;
              targets.push({ id: actor.c.id, name: actor.c.name, hpAfter: actor.hp });
            }

            events.push({
              turn: round, wave: w, actorId: actor.c.id, actorName: actor.c.name,
              action: 'skill', skillId: skill.id, targets, ...codeMeta,
            });
          }
        }

        // End-of-turn MP regeneration (5% of maxMp).
        actor.mp = Math.min(d.maxMp, actor.mp + Math.round(d.maxMp * MP_REGEN_PCT));
        actor.turnsTaken++;
        stampMp(events, turnStart, actor);
      }

      if (!partyAlive()) break outer;
      if (!enemiesAlive()) {
        wavesCleared++;
        events.push({
          turn: round, wave: w, actorId: 'system', actorName: 'system',
          action: 'attack', targets: [], note: 'wave_clear',
        });
        // Wave-clear restore: 15% of maxHp and maxMp for living members.
        for (const f of partyFighters) {
          if (!alive(f)) continue;
          f.hp = Math.min(f.c.derived.maxHp, f.hp + Math.round(f.c.derived.maxHp * WAVE_CLEAR_RESTORE));
          f.mp = Math.min(f.c.derived.maxMp, f.mp + Math.round(f.c.derived.maxMp * WAVE_CLEAR_RESTORE));
        }
        break; // next wave
      }
    }
  }

  victory = wavesCleared >= waveCount && !capped;

  // ---- Rewards & drops (kills count even on defeat) ----
  const dropBonus = party[0]?.derived.dropBonus ?? 0;
  const expBonus = party[0] ? partyExtras(party[0]).expBonus : 0;
  const drops: DropResult = { gold: 0, materials: 0, items: [] };
  let exp = 0;
  /**
   * ทองกับวัตถุดิบสะสมเป็นทศนิยมก่อน แล้วค่อยปัดครั้งเดียวตอนท้าย
   * เพราะตัวคูณของรอบ 2F คูณทั้งก้อน — ปัดทีละตัวจะทำให้ "ฆ่า 30 ตัวได้เศษหาย 30 ครั้ง"
   */
  let goldRaw = 0;
  let materialsRaw = 0;
  let itemCounter = 0;
  const seedTag = (seed >>> 0).toString(36);
  const nextItem = (floorShift = 0) =>
    rollItemWithRng(floor + floorShift, rng, `${seedTag}_f${floor}_${itemCounter++}`);
  const ex = gamedata.elite;
  /**
   * เลเวลที่ใช้ตัดสินว่า "เนื้อหานี้ต่ำกว่าเราแค่ไหน" = เลเวลสูงสุดในปาร์ตี้
   * (ไม่ใช่ค่าเฉลี่ย ไม่งั้นพาเพื่อนเลเวลต่ำมาถ่วงเพื่อคงรางวัลไว้ได้ — โหมด co-op เฟส 3)
   */
  const topLevel = party.reduce((m, c) => Math.max(m, c.level), 1);

  // rewardMult 0 (เวฟดวล) = ข้ามทั้งก้อน จึงไม่กิน rng เลยสักครั้ง
  if (rewardMult > 0) {
    for (const kill of kills) {
      const bossMult = kill.isBoss ? 5 : 1;
      /**
       * ตัวคูณ "เนื้อหาต่ำกว่าตัวเรามาก" (รอบ 2F §3.1 ข้อ 1) — คิดต่อมอนหนึ่งตัว
       * ไม่ใช่ต่อการรบ เพราะเวฟของโซนในอนาคตอาจผสมมอนหลายเลเวลได้
       */
      const falloff = rewardFalloff(topLevel, kill.level);
      // ค่า EXP อยู่ใน gamedata.balance เพื่อให้จูนได้โดยไม่แตะโค้ด (19 ก.ย. 2026)
      exp += (gamedata.balance.expPerMonsterBase
        + kill.level * gamedata.balance.expPerMonsterPerLevel)
        * bossMult * (kill.isElite ? ex.expMult : 1) * falloff;
      goldRaw += (5 + kill.level * 3) * bossMult * (kill.isElite ? ex.goldMult : 1) * falloff;
      if (kill.isBoss) {
        drops.items.push(nextItem());
        if (rng() < 0.3) drops.items.push(nextItem());
        materialsRaw += (5 + Math.floor(rng() * 6)) * falloff; // 5-10
      } else if (kill.isElite) {
        /**
         * EX ต้องคุ้มที่จะสู้ (§4 ข้อ 4) ไม่งั้นผู้เล่นจะเรียนรู้ที่จะกดออกแล้วเข้าใหม่
         * จนกว่าจะไม่เจอ — ซึ่งแปลว่าฟีเจอร์นี้กลายเป็นภาษีเวลา ไม่ใช่รางวัล
         * มอนธรรมดามีโอกาสดรอปของ 12% ส่วน EX การันตีของ + มีโอกาสได้เพิ่ม
         * และของที่ดรอปคิดที่ชั้น floor + itemFloorBonus จึงหายากกว่าของชั้นเดียวกัน
         */
        for (let i = 0; i < ex.itemRolls; i++) drops.items.push(nextItem(ex.itemFloorBonus));
        if (rng() < ex.extraItemChance) drops.items.push(nextItem(ex.itemFloorBonus));
        materialsRaw += (ex.materialsMin
          + Math.floor(rng() * (ex.materialsMax - ex.materialsMin + 1))) * falloff;
      } else {
        if (rng() < NORMAL_EQUIP_DROP_CHANCE * (1 + dropBonus)) drops.items.push(nextItem());
        if (rng() < 0.35) materialsRaw += (1 + Math.floor(rng() * 2)) * falloff; // 1-2
      }
    }
    /**
     * แพ้แล้วได้น้อยกว่าชนะ และได้ตามสัดส่วนเวฟที่ผ่าน (รอบ 2F §3.1 ข้อ 2)
     *
     * ของที่ดรอปไม่โดนตัวคูณนี้ — ของที่ฆ่ามาได้ก็คือฆ่ามาได้ ถ้าริบของตอนแพ้ด้วย
     * จะกลายเป็น "หักของ" ซึ่ง §3.1 ห้ามไว้ตรง ๆ
     */
    const outcomeMult = victory ? 1 : defeatRewardMult(wavesCleared, waveCount);
    exp *= outcomeMult * rewardMult;
    drops.gold = Math.round(goldRaw * outcomeMult * rewardMult);
    drops.materials = Math.round(materialsRaw * outcomeMult * rewardMult);
  }

  return {
    victory,
    wavesCleared,
    events,
    drops,
    expGained: Math.round(exp * (1 + expBonus)),
    seed,
  };
}

/**
 * สัญญาหลักของ engine — ห้ามเปลี่ยนพฤติกรรมเด็ดขาด เทสต์ balance ทั้งชุดพิงมันอยู่
 * (รอบ 2W ย้ายเนื้อในไป simulateWaves เฉย ๆ ผลลัพธ์เหมือนเดิมทุก byte — ดู golden fixture)
 */
export function runBattle(party: Combatant[], floor: number, seed: number): BattleResult {
  const rng = mulberry32(hashSeed(seed, floor * 977, party.length, 0xba771e));
  const waves = buildWaves(floor, party.length, seed);
  return simulateWaves(party, waves, { floor, seed, rng });
}

/**
 * ดวลนานสุดกี่รอบก่อนตัดสินด้วยเลือดที่เหลือ
 *
 * สั้นกว่าการรบปกติมาก (200) เพราะการดวลคือ 1 ต่อ 1 ที่ทั้งสองฝ่ายอาจเป็นสายตันทั้งคู่
 * แล้วไม่มีใครฆ่าใครได้เลย — ปล่อยให้วนถึง 200 รอบคือให้ผู้เล่นนั่งดูฉากที่ไม่มีอะไรเกิดขึ้น
 */
export const DUEL_MAX_ROUNDS = 60;

/** เลือดสุดท้ายของแต่ละตัวจากบันทึกการรบ (ไม่มีในบันทึก = ยังไม่เคยโดนอะไรเลย) */
function finalHp(events: CombatEvent[], id: string, fallback: number): number {
  let hp = fallback;
  for (const ev of events) {
    for (const t of ev.targets) if (t.id === id) hp = t.hpAfter;
  }
  return hp;
}

/**
 * ดวลผู้เล่นกับผู้เล่น (รอบ 2W §5)
 *
 * **หัวใจของเกณฑ์ W2: เรียงคู่ด้วย id ก่อนเสมอ** ทำให้ runDuel(a,b) กับ runDuel(b,a)
 * เป็นการคำนวณชุดเดียวกันทุกไบต์ ไม่ใช่ "สองการคำนวณที่ควรจะเหมือนกัน" —
 * ถ้าปล่อยให้ลำดับ argument เป็นตัวกำหนดว่าใครเป็นฝั่ง party ผู้เล่นสองคนจะเห็นฉากคนละอัน
 * แล้วไม่มีใครรู้ตัวจนกว่าจะมีคนบ่น
 *
 * ไม่ต้องเขียนตรรกะการรบใหม่เลย: ฝั่งศัตรูที่พกโปรแกรมมาจะใช้โปรแกรมนั้นอยู่แล้ว
 * เพราะ `programOf()` เช็ก `programSource` ก่อนเช็ก `side === 'enemy'`
 *
 * ไม่มีของดรอปและไม่มี EXP (`rewardMult: 0`) — การดวลเป็นของแถมที่น่าตื่นเต้น
 * ไม่ใช่แหล่งรางวัล ถ้าให้รางวัลเมื่อไร มันจะกลายเป็นสิ่งที่ต้องฟาร์ม
 */
export function runDuel(a: Combatant, b: Combatant, seed: number): DuelResult {
  const [first, second] = a.id <= b.id ? [a, b] : [b, a];

  /**
   * ขยายเลือดทั้งสองฝ่ายด้วย `balance.duelHpMult` ก่อนเริ่ม
   *
   * ทำไมต้องมี: ดาเมจของผู้เล่นถูกจูนมาเพื่อฆ่ามอนที่มีเลือดแค่ 25% ของผู้เล่น
   * (`monsterHpMult`) พอเอาผู้เล่นสองคนมาชนกันตรง ๆ ทั้งคู่จึงลบกันทิ้งใน 2-3 รอบ
   * วัดจริงแล้วได้ 2.4-3.7 รอบ และผลออกมาเป็น 50/50 แทบทุกคู่ = **ผู้ชนะถูกตัดสิน
   * ด้วยลำดับเทิร์น ไม่ใช่ด้วยโปรแกรม** ซึ่งทำลายเหตุผลทั้งหมดของการมีเวฟดวล
   *
   * ขยายเลือดแทนการลดดาเมจ เพราะมันแตะเฉพาะตัวละครที่เราสร้างเอง ไม่ต้องยุ่งกับแกน
   * การคำนวณดาเมจที่เทสต์ balance ทั้งชุดพิงอยู่ · และเพราะฮีล/โล่คิดเป็น % ของเลือด
   * สัดส่วนจึงไม่เพี้ยน ส่วน MP มีเท่าเดิม = การดวลที่ยาวขึ้นทำให้ต้องคิดเรื่อง MP จริง
   * ซึ่งเป็นการตัดสินใจเชิงโปรแกรม ไม่ใช่เรื่องดวง
   *
   * ค่า 1.5 มาจากการกวาด 1.0-3.0 (20 ก.ย. 2026): ที่ 1.5 การดวลกินราว 7 รอบ
   * ตัดสินด้วยเวลาแค่ 11% และ **คนที่เขียนโปรแกรมเป็นชนะคนที่ตีอย่างเดียว 97-100%**
   * เมื่อคลาสและสเตตัสเท่ากัน ค่าสูงกว่านี้ยืดการดวลโดยไม่ได้ทำให้ผลยุติธรรมขึ้นเลย
   * (ที่ 3.0 การดวลบางคู่ยาว 60 รอบแล้วจบด้วยการนับเลือด ซึ่งน่าเบื่อ)
   */
  const hpMult = gamedata.balance.duelHpMult;
  const stretch = (c: Combatant): Combatant => ({
    ...c,
    derived: { ...c.derived, maxHp: Math.round(c.derived.maxHp * hpMult) },
  });

  const party: Combatant[] = [{ ...stretch(first), side: 'party' }];
  const waves: WaveSpec[] = [{ monsters: [{ ...stretch(second), side: 'enemy' }] }];

  // ชั้นมีผลแค่กับการสุ่มของ ซึ่งปิดไปแล้ว — คิดจากเลเวลเพื่อให้ค่าคงที่และอธิบายได้
  const floor = Math.max(1, Math.round((first.level + second.level) / 4));
  const rng = mulberry32(hashSeed(seed, 0xd0e1, first.level, second.level));

  const r = simulateWaves(party, waves, {
    floor, seed, rng, maxRounds: DUEL_MAX_ROUNDS, rewardMult: 0,
  });

  const rounds = r.events.length > 0 ? r.events[r.events.length - 1].turn : 0;
  const maxFirst = Math.round(first.derived.maxHp * hpMult);
  const maxSecond = Math.round(second.derived.maxHp * hpMult);
  const hpFirst = finalHp(r.events, first.id, maxFirst);
  const hpSecond = finalHp(r.events, second.id, maxSecond);

  let winnerId: string;
  let byTimeout = false;
  if (hpSecond <= 0) winnerId = first.id;
  else if (hpFirst <= 0) winnerId = second.id;
  else {
    // ครบรอบแล้วยังไม่มีใครตาย — ตัดสินด้วย *สัดส่วน* เลือดที่เหลือ ไม่ใช่เลขดิบ
    // ไม่งั้นคนที่เลือดเยอะกว่าโดยธรรมชาติ (สายตัน) ชนะทุกครั้งที่หมดเวลา
    byTimeout = true;
    const pf = hpFirst / Math.max(1, maxFirst);
    const ps = hpSecond / Math.max(1, maxSecond);
    // เสมอจริง ๆ ตัดสินให้ id ที่มาก่อน — คงที่และอธิบายได้ ดีกว่าสุ่ม
    winnerId = ps > pf ? second.id : first.id;
  }

  return { events: r.events, winnerId, byTimeout, rounds };
}
