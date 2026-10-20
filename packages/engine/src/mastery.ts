/**
 * สกิลขั้น 2 — ความเชี่ยวชาญสกิล (20 ต.ค. 2569 · docs/design-skill-acquisition.md ระยะ S2 ข้อ 8.1)
 *
 * สกิลอาชีพ 9 ตัวเดิมขึ้นขั้น 2 ได้เมื่อ "ใช้ถูกจังหวะ" ครบจำนวนที่กำหนด — ขั้น 2 แรงขึ้น (ค่าใน SkillDef.rank2)
 * จังหวะที่ถูกของแต่ละสกิลคือเงื่อนไขที่ต้องเขียน `if` ให้เป็น: ปิดฉากตอนเป้าใกล้ตาย · ลูกไฟตอนศัตรูเหลือน้อย ·
 * พายุน้ำแข็งตอนศัตรูยังเยอะ · ฮีลตอนเลือดลดจริง ฯลฯ
 *
 * กติกาเหมือนตัวตรวจพิสูจน์ภูมิภาค (proofs.ts):
 *  · วัดจากบันทึกการรบที่เซิร์ฟเวอร์จำลองเอง ไม่อ่านตัวโปรแกรม
 *  · กันสแปม: การรบหนึ่งครั้งนับ "ครั้งที่ถูกจังหวะ" ของสกิลนั้นก็ต่อเมื่อถูกจังหวะอย่างน้อย
 *    `acquisition.masteryMinShare` ของทุกครั้งที่ร่าย — ร่ายรัวทุกเทิร์นได้ถูกบ้างโดยบังเอิญแต่ไม่ถึงเกณฑ์
 *  · ตัวเลขเกณฑ์วัดด้วย tools/masteryprobe.cjs
 */
import { TAUNT_ROUNDS } from './combat-rules';
import { gamedata, getSkill } from './data';
import type { CombatEvent, SkillDef } from './types';

/** สภาพสนามตอนผู้เล่นร่ายสกิล (ก่อนผลของการร่ายครั้งนั้น) */
export interface CastContext {
  event: CombatEvent;
  heroId: string;
  heroMaxHp: number;
  /** ศัตรูที่ยังไม่ตายในเวฟนี้: id → เลือดตอนนี้ / เลือดสูงสุด */
  enemies: ReadonlyMap<string, { hp: number; max: number }>;
  /** ผู้เล่นกำลังถูกหมายหัว (มีมอนตั้งท่าเล็งไว้ และยังไม่ได้ลงมือตั้งแต่นั้น) */
  marked: boolean;
  /** ยั่วยุของผู้เล่นมีผลถึงรอบนี้ (0 = ไม่เคยยั่วยุ) */
  tauntUntil: number;
}

interface MasteryRule {
  /** เงื่อนไขภาษาคนสำหรับหน้าเว็บ */
  requirementTh: string;
  /** null = การร่ายครั้งนี้ตัดสินไม่ได้ (เช่น ฮีลเพื่อนในโหมดหลายคน) ไม่นับทั้งถูกและผิด */
  correct(ctx: CastContext): boolean | null;
}

/** แถวของเป้าที่เป็นศัตรู (ไม่ใช่ตัวเรา) ตามลำดับในเหตุการณ์ */
const enemyEntries = (ctx: CastContext) => ctx.event.targets.filter((t) => ctx.enemies.has(t.id));

/** สัดส่วนเลือดของเป้าแรกก่อนโดน */
function firstTargetPct(ctx: CastContext): number | null {
  const t = enemyEntries(ctx)[0];
  const e = t ? ctx.enemies.get(t.id) : undefined;
  return e && e.max > 0 ? e.hp / e.max : null;
}

const pctTh = (x: number) => `${Math.round(x * 100)}%`;

function targetHpBelow(max: number): MasteryRule {
  return {
    requirementTh: `ใช้กับเป้าที่เลือดเหลือไม่ถึง ${pctTh(max)} — เก็บไว้ปิดงาน`,
    correct: (ctx) => {
      const p = firstTargetPct(ctx);
      return p === null ? null : p < max;
    },
  };
}

function hitsAtLeast(n: number): MasteryRule {
  return {
    requirementTh: `โดนศัตรูอย่างน้อย ${n} ตัวในการร่ายครั้งเดียว — ตอนศัตรูเหลือน้อยใช้ท่าเดี่ยวคุ้มกว่า`,
    correct: (ctx) => new Set(enemyEntries(ctx).map((t) => t.id)).size >= n,
  };
}

function enemiesAtMost(n: number): MasteryRule {
  return {
    requirementTh: `ใช้ตอนศัตรูเหลือไม่เกิน ${n} ตัว — ตอนศัตรูยังเยอะ ท่าวงกว้างคุ้มกว่า`,
    correct: (ctx) => ctx.enemies.size <= n,
  };
}

function enemiesAtLeast(n: number, why: string): MasteryRule {
  return {
    requirementTh: `ใช้ตอนมีศัตรูอย่างน้อย ${n} ตัว — ${why}`,
    correct: (ctx) => ctx.enemies.size >= n,
  };
}

/**
 * ตีตัวที่เลือดมากที่สุด (เหมือน strongest(enemies)) ตอนมีศัตรูให้เลือกอย่างน้อย 2 ตัว
 *
 * ฉบับแรกวัดแค่ "เป้าเลือดยังเกินครึ่ง" แล้ว masteryprobe พบว่าสแปมใส่ weakest(enemies) ถูก 82% —
 * ท่าแรงฆ่ามอนชั้นต้นได้ในทีเดียว ทุกครั้งที่ร่ายจึงเจอเป้าที่ยังเต็มเสมอ เงื่อนไขนั้นจึงไม่ได้วัดการเลือกอะไรเลย
 * การเลือกเป้าวัดได้จริงกว่า: สแปมใส่ตัวที่เลือดน้อยสุดถูกเฉพาะตอนเลือดเท่ากันทั้งเวฟ
 */
const strongestTarget: MasteryRule = {
  requirementTh: 'ตีตัวที่เลือดมากที่สุดตอนมีศัตรูอย่างน้อย 2 ตัว (strongest(enemies)) — ท่าแรงคุ้มที่สุดกับตัวที่ทนที่สุด ตีธรรมดาเก็บตัวที่ใกล้ตาย',
  correct: (ctx) => {
    // ศัตรูเหลือตัวเดียวไม่มีให้เลือก — ไม่นับทั้งถูกและผิด
    if (ctx.enemies.size < 2) return null;
    const t = enemyEntries(ctx)[0];
    const hit = t ? ctx.enemies.get(t.id) : undefined;
    if (!hit) return null;
    return [...ctx.enemies.values()].every((e) => hit.hp >= e.hp);
  },
};

/**
 * กระแทกระหว่างยั่วยุอยู่ (has_buff("taunt")) — ผู้พิทักษ์ดึงศัตรูมาที่ตัวเองก่อน แล้วค่อยสวนกลับ
 * ยั่วยุมีผลถึงจบรอบ (รอบที่ร่าย + TAUNT_ROUNDS) ตามที่ battle.ts ตั้ง `tauntUntil`
 */
function duringTaunt(): MasteryRule {
  return {
    requirementTh: `กระแทกระหว่างที่ยั่วยุอยู่ (has_buff("taunt")) — ดึงศัตรูมาที่ตัวเองก่อนแล้วค่อยสวนกลับ`,
    correct: (ctx) => ctx.tauntUntil >= ctx.event.turn,
  };
}

/** ฮีลตอนเป้าเลือดไม่ถึงครึ่ง — เลือดก่อนฮีลคิดจากแถวของเหตุการณ์เองจึงตรงเป๊ะ */
const healWhenHurt: MasteryRule = {
  requirementTh: 'ฮีลตอนเป้าเลือดเหลือไม่ถึง 50% — ฮีลตอนเลือดยังเต็มคือเสีย MP เปล่า',
  correct: (ctx) => {
    const t = ctx.event.targets.find((x) => x.heal !== undefined && !x.drain);
    if (!t || t.id !== ctx.heroId) return null;
    const before = t.hpAfter - (t.heal ?? 0);
    return before / Math.max(1, ctx.heroMaxHp) < 0.5;
  },
};

/** กางโล่ตอนเลือดลดแล้ว หรือรู้ว่าท่าแรงกำลังมา */
const shieldWhenNeeded: MasteryRule = {
  requirementTh: 'กางตอนเลือดตัวเองเหลือไม่ถึง 70% หรือกำลังถูกหมายหัว (has_debuff("marked")) — โล่ซ้อนตอนเลือดเต็มไม่ได้ช่วยอะไร',
  correct: (ctx) => {
    const t = ctx.event.targets.find((x) => x.shield !== undefined);
    if (!t || t.id !== ctx.heroId) return null;
    return ctx.marked || t.hpAfter / Math.max(1, ctx.heroMaxHp) < 0.7;
  },
};

/** เงื่อนไขของแต่ละสกิล — ต้องมีครบทุกสกิลที่มี `rank2` (เทสต์คุม) */
const RULES: Record<string, MasteryRule> = {
  w_power_strike: strongestTarget,
  w_whirlwind: hitsAtLeast(3),
  w_execute: targetHpBelow(0.3),
  m_firebolt: enemiesAtMost(2),
  m_blizzard: hitsAtLeast(3),
  m_heal: healWhenHurt,
  g_shield_bash: duringTaunt(),
  g_taunt: enemiesAtLeast(2, 'ยั่วยุตอนเหลือศัตรูตัวเดียวแทบไม่ได้อะไร'),
  g_barrier: shieldWhenNeeded,
};

/** สกิลที่มีขั้น 2 */
export const MASTERY_SKILLS: readonly string[] = Object.keys(RULES);

/** เงื่อนไข "ใช้ถูกจังหวะ" ของสกิลนี้ (null = สกิลนี้ไม่มีขั้น 2) */
export function masteryRequirement(skillId: string): string | null {
  return RULES[skillId]?.requirementTh ?? null;
}

export interface MasteryTally {
  /** ร่ายกี่ครั้ง (นับเฉพาะครั้งที่ตัดสินได้) */
  casts: number;
  /** ถูกจังหวะกี่ครั้ง */
  correct: number;
  /** ครั้งที่นับเข้าความเชี่ยวชาญจริง — `correct` ถ้าถูกจังหวะถึงเกณฑ์ ไม่งั้น 0 */
  credited: number;
}

/**
 * อ่านการรบหนึ่งครั้ง → ผลของแต่ละสกิลที่มีขั้น 2 (มีเฉพาะสกิลที่ร่ายอย่างน้อยครั้งหนึ่ง)
 * เดินเหตุการณ์ครั้งเดียว ติดตามเลือดศัตรูจาก `wave_start` (เลือดเต็มของทุกตัว) และ `hpAfter` ของทุกแถว
 * — เลือดศัตรูเปลี่ยนได้ทางเดียวคือผ่านเหตุการณ์ จึงตรงเป๊ะ
 */
export function masteryFromBattle(events: readonly CombatEvent[], heroId: string, heroMaxHp: number): Record<string, MasteryTally> {
  const tallies: Record<string, MasteryTally> = {};
  const enemies = new Map<string, { hp: number; max: number }>();
  let marked = false;
  let tauntUntil = 0;

  for (const e of events) {
    if (e.note === 'wave_start') {
      enemies.clear();
      for (const t of e.targets) enemies.set(t.id, { hp: t.hpAfter, max: t.hpAfter });
      marked = false;
      continue;
    }
    if (e.note === 'wave_clear') { marked = false; continue; }
    if (e.note === 'windup' && e.targets.some((t) => t.id === heroId)) marked = true;

    if (e.actorId === heroId && e.note !== 'poison' && e.note !== 'stunned') {
      const rule = e.action === 'skill' && e.skillId ? RULES[e.skillId] : undefined;
      if (rule) {
        const alive = new Map([...enemies].filter(([, v]) => v.hp > 0));
        const ok = rule.correct({ event: e, heroId, heroMaxHp, enemies: alive, marked, tauntUntil });
        if (ok !== null) {
          const t = (tallies[e.skillId!] ??= { casts: 0, correct: 0, credited: 0 });
          t.casts++;
          if (ok) t.correct++;
        }
      }
      marked = false;
      if (e.action === 'skill' && e.skillId && getSkill(e.skillId)?.kind === 'taunt') tauntUntil = e.turn + TAUNT_ROUNDS;
    }

    for (const t of e.targets) {
      const known = enemies.get(t.id);
      if (known) known.hp = t.hpAfter;
    }
  }

  const minShare = gamedata.acquisition.masteryMinShare;
  for (const t of Object.values(tallies)) {
    t.credited = t.casts > 0 && t.correct / t.casts >= minShare ? t.correct : 0;
  }
  return tallies;
}

/** ขั้นของสกิลจากจำนวนครั้งที่สะสม (สกิลที่ไม่มีขั้น 2 = 1 เสมอ) */
export function skillRank(skillId: string, count: number): 1 | 2 {
  const skill: SkillDef | undefined = getSkill(skillId);
  return skill?.rank2 && count >= gamedata.acquisition.masteryNeed ? 2 : 1;
}

/** ขั้นของทุกสกิลที่ถึงขั้น 2 แล้ว — รูปที่ battle.ts อ่าน (`Combatant.skillRanks`) */
export function skillRanksOf(mastery: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, count] of Object.entries(mastery)) if (skillRank(id, count) === 2) out[id] = 2;
  return out;
}

/**
 * รวมผลการรบเข้ากับที่สะสมไว้ — คืนค่าสะสมใหม่และรายการที่ขยับ
 * สกิลที่ถึงขั้น 2 แล้วยังนับต่อได้ (ไม่มีขั้น 3) แต่หยุดที่ masteryNeed เพื่อไม่ให้ตัวเลขโตไม่สิ้นสุด
 */
export function addMastery(
  current: Readonly<Record<string, number>>,
  tallies: Readonly<Record<string, MasteryTally>>,
  owned: readonly string[],
): { mastery: Record<string, number>; changes: { skillId: string; gained: number; total: number; rankedUp: boolean }[] } {
  const need = gamedata.acquisition.masteryNeed;
  const mastery: Record<string, number> = { ...current };
  const changes: { skillId: string; gained: number; total: number; rankedUp: boolean }[] = [];
  for (const [skillId, t] of Object.entries(tallies)) {
    if (!owned.includes(skillId) || t.credited <= 0) continue;
    const before = mastery[skillId] ?? 0;
    if (before >= need) continue;
    const total = Math.min(need, before + t.credited);
    mastery[skillId] = total;
    changes.push({ skillId, gained: total - before, total, rankedUp: before < need && total >= need });
  }
  return { mastery, changes };
}
