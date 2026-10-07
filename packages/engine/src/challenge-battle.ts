/**
 * มอนของโจทย์ — สร้างเวฟและสู้ (docs/design-challenge-monsters.md) · กติกาอยู่ที่ challenge.ts
 *
 * ไม่มีตรรกะการรบใหม่:
 * - สเตตัสคิดด้วย `makeMonster` ตัวเดียวกับหอคอย (ต้นแบบ + เลเวล + ตัวคูณ)
 * - โปรแกรมของมอนรันผ่าน `programSource` แบบเดียวกับการดวล (battle.ts → programOf)
 * - จำลองด้วย `simulateWaves` แบบปิดรางวัลของ engine (`rewardMult: 0`) — รางวัลชนะครั้งแรกคิดแยกที่ `challengeReward`
 */
import { simulateWaves } from './battle';
import { gamedata } from './data';
import { allocatePoints } from './proficiency';
import { challengeArchetype, challengeMonsterSkills, type ChallengeMonsterSpec } from './challenge';
import { hashSeed, mulberry32 } from './rng';
import { FORMULAS, ZERO_PROFICIENCY, type BaseStats, type BattleResult, type ClassId, type Combatant, type WaveSpec } from './types';
import { makeMonster } from './waves';

/** id ของมอนตัวที่ i (เริ่ม 1) — มี archetype ต่อท้ายแบบเดียวกับหอคอย หน้าเว็บอ่านภาพจาก monsterId อยู่แล้ว */
export const challengeMonsterId = (i: number, archetypeId: string) => `ch_m${i}_${archetypeId}`;

/** มอนของโจทย์ในรูปที่ engine ใช้รบ (เวฟเดียว) — สมมติว่าผ่าน `challengeMonsterIssues` แล้ว */
export function buildChallengeWave(specs: ChallengeMonsterSpec[]): WaveSpec {
  const monsters = specs.map((m, idx) => {
    const arch = challengeArchetype(m.archetypeId);
    if (!arch) throw new Error(`unknown archetype ${m.archetypeId}`);
    const c = makeMonster(arch, m.level, challengeMonsterId(idx + 1, arch.id), {
      coopMult: 1,
      hpMult: m.hpMult,
      dmgMult: m.dmgMult,
      name: m.name.trim(),
    });
    c.skills = challengeMonsterSkills(m);
    const program = typeof m.programSource === 'string' && m.programSource.trim() !== '' ? m.programSource.replace(/\r\n?/g, '\n') : null;
    // ไม่มีโปรแกรม = battle.ts ใช้โปรแกรมตามบทบาทของต้นแบบเอง (monsterProgramFor)
    return program ? ({ ...c, programSource: program } as Combatant) : c;
  });
  return { monsters };
}

/**
 * สู้กับมอนของโจทย์ — ผู้เล่นคนเดียว เวฟเดียว ไม่มีรางวัลจาก engine
 * ชั้น (floor) ใช้แค่กับการสุ่มของซึ่งปิดอยู่ — คิดจากเลเวลมอนสูงสุดให้ค่าคงที่และอธิบายได้
 */
export function runChallengeBattle(hero: Combatant, specs: ChallengeMonsterSpec[], seed: number): BattleResult {
  const wave = buildChallengeWave(specs);
  const topLevel = Math.max(1, ...specs.map((m) => m.level));
  const floor = Math.max(1, Math.ceil(topLevel / 2));
  const rng = mulberry32(hashSeed(seed, 0xc4a11e, specs.length, topLevel));
  return simulateWaves([{ ...hero, side: 'party' }], [wave], { floor, seed, rng, rewardMult: 0 });
}

/**
 * สเตตัสของตัวละครตัวอย่างตอนทดลองสู้ (ข้อ M7) — ค่าตั้งต้นของอาชีพ + แต้มทุกเลเวลที่ผ่านมา
 * แจกด้วย `allocatePoints` ตัวเดียวกับการเลเวลอัพจริง แบบไม่มีงานสะสม (= น้ำหนักมาตรฐานของอาชีพ)
 * จึงเป็น "ผู้เล่นทั่วไปของอาชีพนี้ที่เลเวลนี้" ไม่ใช่บิลด์สุดโต่งทางใดทางหนึ่ง · ไม่มีอุปกรณ์
 */
export function trialHeroStats(classId: ClassId, level: number): BaseStats {
  const stats = { ...gamedata.classes[classId].baseStats };
  for (let lv = 2; lv <= Math.max(1, Math.floor(level)); lv++) {
    const add = allocatePoints(ZERO_PROFICIENCY, FORMULAS.statPointsPerLevel, classId, lv);
    stats.str += add.str;
    stats.int += add.int;
    stats.vit += add.vit;
    stats.agi += add.agi;
    stats.luk += add.luk;
  }
  return stats;
}
