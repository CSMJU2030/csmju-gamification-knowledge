/**
 * ตัวอย่างการรบของแต่ละอาชีพก่อนเลือก (playtest รอบ B ข้อ 3 · 26 ก.ย. 2026)
 *
 * ผู้เล่นรายงานว่า "ตอนเปิดอาชีพเราใช้แค่ attack คนปกติคงเลือกแค่อาชีพแรก เพราะไม่เห็นว่าอาชีพอื่นมีอะไร"
 * ตัวอย่างนี้ให้เห็นกับตาว่าแต่ละอาชีพสู้ยังไง ด้วยตัวละครของผู้เล่นเอง (เลเวล สเตตัส ของที่สวม)
 * แล้วเทียบกันได้จริง เพราะทุกอาชีพเจอเวฟชุดเดียวกัน (seed คงที่)
 *
 * ไม่บันทึกอะไรเลย: ไม่มี EXP ไม่มีของ ไม่นับความชำนาญ (rewardMult 0 = ไม่กิน rng ของการแจกของด้วย)
 */
import {
  buildWaves, hashSeed, mulberry32, parse, preferredSkillName, simulateWaves,
  type BattleResult, type ClassId, type CombatEvent,
} from '@tower/engine';
import { unlockedSkills } from './game-rules';

/** สั้นพอให้ดูจบในครึ่งนาที แต่ยาวพอให้ MP หมดแล้วเห็นว่าโปรแกรมทำอะไรต่อ */
export const TRIAL_WAVES = 3;
/** seed คงที่ → ทุกอาชีพ (และทุกครั้งที่กด) เจอเวฟเดียวกัน เทียบกันได้ตรง ๆ */
export const TRIAL_SEED = 20260926;

interface Branch {
  skillId: string;
  /** เงื่อนไขภาษา BloxCode — ใช้ได้ตั้งแต่ผ่านชั้น 1 (if/else + ข้อความ) */
  cond: (cost: number) => string;
  target: string;
}

/**
 * ลำดับความสำคัญของสกิลในโปรแกรมตัวอย่าง (บนสุดมาก่อน) — ใส่เฉพาะสกิลที่ปลดแล้วที่เลเวลปัจจุบัน
 * เขียนด้วย if/else ซ้อน ไม่ใช้ elif/and เพราะผู้เล่นที่เพิ่งผ่านชั้น 1 ยังเขียนสองอย่างนั้นไม่ได้
 * โปรแกรมที่เห็นจึงเป็นโปรแกรมที่เขาก๊อปไปใช้ได้ทันทีหลังเลือกอาชีพ
 */
const BRANCHES: Record<string, Branch[]> = {
  warrior: [
    { skillId: 'w_whirlwind', cond: () => 'count(enemies) >= 3', target: 'enemies' },
    { skillId: 'w_power_strike', cond: (c) => `me.mp >= ${c}`, target: 'weakest(enemies)' },
  ],
  mage: [
    { skillId: 'm_heal', cond: () => 'me.hp_pct < 40', target: 'me' },
    { skillId: 'm_blizzard', cond: () => 'count(enemies) >= 3', target: 'enemies' },
    { skillId: 'm_firebolt', cond: (c) => `me.mp >= ${c}`, target: 'weakest(enemies)' },
  ],
  guardian: [
    { skillId: 'g_barrier', cond: () => 'me.hp_pct < 50', target: 'me' },
    { skillId: 'g_taunt', cond: () => 'count(enemies) >= 3', target: 'me' },
    { skillId: 'g_shield_bash', cond: (c) => `me.mp >= ${c}`, target: 'weakest(enemies)' },
  ],
};

export function demoProgram(classId: ClassId, level: number): { source: string; skills: string[] } {
  const unlocked = new Map(unlockedSkills(classId, level).map((s) => [s.id, s]));
  const branches = (BRANCHES[classId] ?? []).filter((b) => unlocked.has(b.skillId));

  const lines = ['def turn():'];
  const emit = (i: number, depth: number) => {
    const pad = '    '.repeat(depth);
    if (i >= branches.length) {
      lines.push(`${pad}attack(weakest(enemies))`);
      return;
    }
    const b = branches[i];
    const skill = unlocked.get(b.skillId)!;
    lines.push(`${pad}if ${b.cond(skill.mpCost)}:`);
    lines.push(`${pad}    cast("${preferredSkillName(b.skillId)}", ${b.target})`);
    lines.push(`${pad}else:`);
    emit(i + 1, depth + 1);
  };
  emit(0, 1);
  const source = `${lines.join('\n')}\n`;
  // โปรแกรมที่ประกอบขึ้นต้องผ่าน parser ของเกมเสมอ — พังตรงนี้คือบั๊กของโค้ดนี้เอง
  if (!parse(source).program) throw new Error(`โปรแกรมตัวอย่างของ ${classId} ผิดไวยากรณ์`);
  return { source, skills: branches.map((b) => b.skillId) };
}

export interface TrialSummary {
  /** จำนวนเทิร์นที่ตัวละครได้ลงมือ */
  turns: number;
  /** ร่ายสกิลกี่ครั้ง (ไม่นับครั้งที่ MP ไม่พอแล้วกลายเป็นตีธรรมดา) */
  skillCasts: number;
  damageDealt: number;
  damageTaken: number;
  /** เลือดที่เหลือตอนจบ (% ของหลอด) */
  hpLeftPct: number;
}

export function trialSummary(events: CombatEvent[], heroId: string, maxHp: number): TrialSummary {
  let turns = 0, skillCasts = 0, damageDealt = 0, damageTaken = 0;
  let hp = maxHp;
  for (const e of events) {
    if (e.actorId === heroId) {
      turns++;
      if (e.action === 'skill') skillCasts++;
      for (const t of e.targets) if (t.id !== heroId) damageDealt += t.damage ?? 0;
    }
    for (const t of e.targets) {
      if (t.id !== heroId) continue;
      if (e.actorId !== heroId) damageTaken += t.damage ?? 0;
      hp = t.hpAfter;
    }
  }
  return { turns, skillCasts, damageDealt, damageTaken, hpLeftPct: Math.round((Math.max(0, hp) / Math.max(1, maxHp)) * 100) };
}

/** รบตัวอย่าง: เวฟแรก ๆ ของชั้นที่ผ่านแล้วล่าสุด (อย่างน้อยชั้น 1) */
export function runTrial(
  hero: Parameters<typeof simulateWaves>[0][number],
  floor: number,
): BattleResult {
  const waves = buildWaves(floor, 1, TRIAL_SEED).slice(0, TRIAL_WAVES);
  const rng = mulberry32(hashSeed(TRIAL_SEED, floor * 977, 1, 0xba771e));
  return simulateWaves([hero], waves, { floor, seed: TRIAL_SEED, rng, rewardMult: 0 });
}
