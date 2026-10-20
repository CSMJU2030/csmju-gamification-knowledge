/**
 * ข้อมูลเกมที่ backend ต้องใช้ — อ่านจาก engine ทางเดียว (ไม่มีสำเนาของตัวเลขใด ๆ ที่นี่)
 */
import {
  gamedata, regionSkillFor, skillsFor,
  type BaseStats, type ClassId, type SkillDef, type SkillSources,
} from '@tower/engine';

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

/**
 * สกิลที่ตัวละครใช้ได้: สกิลอาชีพตามเลเวล + สกิลภูมิภาคที่พิสูจน์แล้ว (ระยะ S1)
 * + สกิลสายจากความชำนาญ (ระยะ S3) + สกิลจากตำรา (ระยะ S4) — engine `skillsFor` ตัวเดียว
 * ทุกทางเข้า (รบ · ตรวจโปรแกรม · หน้าตัวละคร · สแนปช็อตดวล) เรียกผ่าน `ownedSkills(row)` เพื่อให้ได้ที่มาครบทุกทางเสมอ
 */
export function unlockedSkills(
  classId: ClassId, level: number, sources: readonly string[] | SkillSources = {},
): SkillDef[] {
  return skillsFor(classId, level, sources);
}

/** ช่องของแถวตัวละครที่ใช้ตัดสินสกิล — แยกไว้ให้เทสต์ส่งแถวย่อได้ */
export interface SkillRow {
  classId: string;
  level: number;
  provedRegions: string[];
  skillBooks: string[];
  statStr: number;
  statInt: number;
  statVit: number;
  statAgi: number;
  statLuk: number;
}

const statsOfRow = (row: SkillRow): BaseStats =>
  ({ str: row.statStr, int: row.statInt, vit: row.statVit, agi: row.statAgi, luk: row.statLuk });

/** ที่มาของสกิลทั้งหมดของแถวนี้ — สเตตัสจริง (ไม่ใช่ค่าที่ล็อกเลเวล) */
export function skillSourcesOf(row: SkillRow, stats: BaseStats = statsOfRow(row)): SkillSources {
  return { provedRegions: row.provedRegions, stats, books: row.skillBooks };
}

/**
 * สกิลทั้งหมดของตัวละคร · `level` แยกไว้ให้การล็อกเลเวล (รอบ 2L) ส่งเลเวลที่ล็อกได้
 * — สกิลอาชีพตามเลเวลลดตาม ส่วนสกิลที่ได้จากทางอื่นผูกกับตัวละครจึงอยู่ครบ
 */
export function ownedSkills(row: SkillRow, level: number = row.level, stats?: BaseStats): SkillDef[] {
  return skillsFor(row.classId, level, skillSourcesOf(row, stats));
}

/** ความเชี่ยวชาญที่สะสมไว้ — กรองค่าแปลก ๆ ออก (JSON จากฐานข้อมูลไม่มี type บังคับ) */
export function masteryOf(row: { skillMastery: unknown }): Record<string, number> {
  const raw = row.skillMastery;
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
    }
  }
  return out;
}

/** ตัวนับเพดานดวงของตำรา — กรองแบบเดียวกับ masteryOf */
export function bookPityOf(row: { bookPity: unknown }): Record<string, number> {
  return masteryOf({ skillMastery: row.bookPity });
}

/** สกิลประจำภูมิภาคของอาชีพนี้ในรูปที่ส่งออก API (null = ผู้ฝึกหัด หรือภูมิภาคไม่มีสกิล) */
export function regionSkillView(classId: string, regionId: string) {
  const s = regionSkillFor(classId, regionId);
  return s ? { id: s.id, nameTh: s.nameTh, kind: s.kind, mpCost: s.mpCost, aoe: s.aoe } : null;
}

export function baseItemById(baseId: string): BaseItemDef | undefined {
  return gamedata.baseItems.find((b) => b.baseId === baseId);
}
