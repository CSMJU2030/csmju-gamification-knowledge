/**
 * ข้อมูลเกมที่ backend ต้องใช้ — อ่านจาก engine ทางเดียว (ไม่มีสำเนาของตัวเลขใด ๆ ที่นี่)
 */
import { gamedata, type ClassId, type SkillDef } from '@tower/engine';

export type BaseItemDef = (typeof gamedata.baseItems)[number];

/** ทุกตัวละครเริ่มเป็นผู้ฝึกหัด แล้วเลือกอาชีพจริงหลังผ่านชั้น 1 (รอบ 2P §3.3) */
export const STARTING_CLASS: ClassId = 'novice';

/** ชั้นที่ต้องผ่านก่อนเลือกอาชีพได้ — ต้องเห็นการต่อสู้จริงก่อนค่อยตัดสินใจ */
export const CLASS_CHOICE_FLOOR = 1;

/** โปรแกรมพื้นฐานที่ตัวละครใหม่ทุกตัวได้ตั้งแต่วินาทีแรก (ใช้ได้ตั้งแต่ชั้น 0) */
export const TRIVIAL_PROGRAM = 'def turn():\n    attack(weakest(enemies))\n';

/** กันเพย์โหลดใหญ่ผิดปกติก่อนเข้า tokenizer (นับเป็นตัวอักษร ไม่ใช่บรรทัด) */
export const MAX_PROGRAM_CHARS = 20000;

/** ชั้นสูงสุดของหอคอยที่ท้าทายได้ */
export const TOWER_MAX_FLOOR = 10;

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'accessory'] as const;

export function classSkills(classId: ClassId): SkillDef[] {
  return gamedata.skills.filter((s) => s.classId === classId);
}

export function unlockedSkills(classId: ClassId, level: number): SkillDef[] {
  return classSkills(classId).filter((s) => s.unlockLevel <= level);
}

export function baseItemById(baseId: string): BaseItemDef | undefined {
  return gamedata.baseItems.find((b) => b.baseId === baseId);
}
