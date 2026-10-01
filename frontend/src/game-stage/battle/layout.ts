/**
 * เลย์เอาต์ฉาก 2D มุมกล้อง "หลังผู้เล่น"
 *   - ผู้เล่นอยู่ล่างซ้าย ใกล้กล้องที่สุด → สไปรต์ใหญ่ + แท่นยืนใหญ่
 *   - ศัตรูสูงสุด 4 ตัว ยิ่งไกล = อยู่สูงขึ้น (เข้าใกล้เส้นขอบฟ้า) + แท่นเล็กลง
 * พิกัดทั้งหมดอยู่ในระบบ 256x160 (ก่อนขยาย x5)
 */
import { SCENE, SIZE } from '../sprites/schema';
import type { Vec } from './pixel';

export interface Slot {
  /** จุดกึ่งกลางเท้า */
  x: number;
  y: number;
  /** รัศมีแท่นยืน */
  rx: number;
  ry: number;
}

const stand = (x: number, y: number): Slot => {
  const rx = Math.round(9 + (y - 92) * 0.46);
  return { x, y, rx: Math.max(8, rx), ry: Math.max(3, Math.round(rx * 0.3)) };
};

/** ผู้เล่น: ใกล้กล้อง มุมซ้ายล่าง (ตามภาพพิสูจน์แนวคิดของ PM) */
export const PLAYER_SLOT: Slot = { x: 58, y: 150, rx: 38, ry: 10 };

const ENEMY_SLOTS: Record<number, Slot[]> = {
  1: [stand(160, 116)],
  2: [stand(132, 106), stand(196, 120)],
  3: [stand(120, 100), stand(168, 120), stand(216, 106)],
  4: [stand(110, 98), stand(152, 118), stand(198, 102), stand(236, 122)],
};

export function enemySlots(count: number): Slot[] {
  if (count <= 0) return [];
  if (count <= 4) return ENEMY_SLOTS[count];
  // เผื่อไว้ถ้าเอนจินส่งมาเกิน 4: กระจายเป็นซิกแซกตามเส้นขอบฟ้า
  const out: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push(stand(Math.round(104 + t * 132), i % 2 === 0 ? 100 : 120));
  }
  return out;
}

export function spriteBoxFor(kind: 'player' | 'monster' | 'boss'): { w: number; h: number } {
  return kind === 'player' ? SIZE.player : kind === 'boss' ? SIZE.boss : SIZE.monster;
}

/** จุดอ้างอิงของเอฟเฟกต์ = กลางลำตัว */
export function anchorOf(slot: Slot, h: number): Vec {
  return { x: slot.x, y: slot.y - Math.round(h * 0.55) };
}

/**
 * แผนที่ boss -> archetype (มิเรอร์จาก engine/data/gamedata.json → bosses[].archetype)
 * ใช้เป็น fallback ถ้าชีตไม่มีสไปรต์เฉพาะของบอส
 */
export const BOSS_ARCHETYPE: Record<string, string> = {
  boss_king_slime: 'slime',
  boss_gob_chief: 'goblin',
  boss_alpha_wolf: 'wolf',
  boss_bone_lord: 'skeleton',
  boss_arch_mage: 'dark_mage',
  boss_war_chief: 'orc',
  boss_storm_harpy: 'harpy',
  boss_iron_golem: 'golem',
  boss_lich_king: 'lich',
  boss_tower_lord: 'golem',
};

/**
 * id ของ combatant จากเอนจินมีรูปแบบ
 *   `f<floor>w<wave>_m<i>_<archetypeId>`  หรือ  `f<floor>w<wave>_boss_<bossId>`
 * (archetype id มี '_' ได้ เช่น dark_mage → ต้อง join ตั้งแต่ส่วนที่ 3 เป็นต้นไป)
 * คืน "รายการ id สไปรต์ที่ควรลอง" เรียงจากเจาะจงที่สุด
 */
export function spriteIdCandidates(combatantId: string): string[] {
  const parts = combatantId.split('_');
  if (parts.length < 3) return [];
  const rest = parts.slice(2).join('_');
  if (parts[1] === 'boss') {
    const arch = BOSS_ARCHETYPE[rest];
    return arch ? [`boss:${rest}`, `mon:${arch}`] : [`boss:${rest}`];
  }
  return [`mon:${rest}`];
}

/** จุดรวมสายตาของเส้นพื้น */
export const VANISH: Vec = { x: Math.round(SCENE.baseW / 2), y: SCENE.horizonY };
