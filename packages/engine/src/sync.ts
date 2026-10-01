/**
 * ล็อกเลเวลในภูมิภาค (รอบ 2L — docs/design-round2l.md)
 *
 * ปัญหาที่ไฟล์นี้แก้ วัดได้ในรอบ 2F: คนเขียน `attack(weakest(enemies))` บรรทัดเดียว
 * จบเกม 6 ใน 6 รอบ เพราะ **ไม่มีชั้นไหนที่เลเวลเพิ่มแล้วไม่ช่วย** — สะสม EXP ไปเรื่อย ๆ
 * ก็ชนะทุกชั้นในที่สุด ในภูมิภาค เลเวลที่เกินมาจึงถูกตัดทิ้ง เหลือแค่โค้ดเป็นตัวตัดสิน
 *
 * **ล็อกแค่เลขเลเวลไม่พอ** — เลขเลเวลโผล่ในสูตรแค่ maxHp (+10) กับ maxMp (+2)
 * พลังจริงมาจาก str/vit/int ที่ได้มา *จาก* การเลเวลอัพ นักรบเลเวล 21 ที่มี STR 81
 * ถ้าล็อกแค่เลข จะยังตี atk 167 ในโซนเลเวล 10 ขณะที่คนเลเวล 10 จริงตีได้ราว 95
 * ไฟล์นี้จึงล็อกสามอย่างพร้อมกัน: เลเวล · สเตตัส · อุปกรณ์
 *
 * ทุกฟังก์ชันเป็นฟังก์ชันบริสุทธิ์ ไม่แตะ state — server เรียกก่อนสร้าง Combatant
 * แล้วส่งค่าที่ล็อกแล้วเข้า buildDerivedStats เส้นทางเดิม ไม่มีสูตรพลังชุดที่สอง
 */
import type { BaseStats, ClassId, ItemInstance } from './types';
import { gamedata } from './data';

export interface SyncedLoadout {
  level: number;
  stats: BaseStats;
  equipment: ItemInstance[];
  /** true = ถูกตัดลงจริง · false = ผู้เล่นเลเวลไม่ถึงโซน สู้ด้วยค่าจริง */
  synced: boolean;
}

/**
 * เลเวลที่ล็อกของชั้นนี้ — มาจาก `gamedata.balance.levelSync` (index 0 = ชั้น 1)
 * ตารางถูกเลือกด้วยการวัด (`engine/tools/syncprobe.cjs`) ไม่ใช่เดา ดู §4 ของเอกสารรอบ
 * ชั้นที่เลยท้ายตารางใช้ค่าสุดท้าย — ดีกว่าโยน error กลางการรบถ้าวันหนึ่งเพิ่มโซนชั้น 11
 */
export function syncLevelForFloor(floor: number): number {
  const table = gamedata.balance.levelSync;
  const i = Math.max(0, Math.min(table.length - 1, Math.floor(floor) - 1));
  return table[i];
}

/**
 * ย่อแต้มที่ได้จากการเลเวลลงตามสัดส่วน — **รักษารูปทรงของบิลด์ไว้**
 *
 *   stat = ค่าตั้งต้นของอาชีพ + (stat - ค่าตั้งต้น) × (เลเวลโซน - 1) / (เลเวลจริง - 1)
 *
 * ทำไมไม่คืนค่าตั้งต้นเฉย ๆ แล้วแจกแต้มใหม่: บิลด์ของผู้เล่นมาจากสิ่งที่โปรแกรมของเขา
 * ทำจริงมาตลอดเกม (ระบบความชำนาญรอบ 2P) คนที่ตีเยอะจนเป็นสาย STR ต้องยังเป็นสาย STR
 * ในภูมิภาค ไม่งั้นทุกคนในภูมิภาคจะเหมือนกันหมด และรอบ 2P เป็นโมฆะในครึ่งหนึ่งของเกม
 *
 * ค่าที่ต่ำกว่าค่าตั้งต้น (ไม่ควรเกิด แต่เซฟเก่าอาจมี) ถูกปล่อยไว้ตามจริง ไม่ถูกดึงขึ้น
 */
export function syncStats(
  classId: ClassId, level: number, stats: BaseStats, targetLevel: number,
): BaseStats {
  if (level <= targetLevel || level <= 1) return { ...stats };
  const base = gamedata.classes[classId].baseStats;
  const ratio = (targetLevel - 1) / (level - 1);
  const shrink = (k: keyof BaseStats): number => {
    const gained = stats[k] - base[k];
    return gained <= 0 ? stats[k] : base[k] + Math.round(gained * ratio);
  };
  return {
    str: shrink('str'), int: shrink('int'), vit: shrink('vit'),
    agi: shrink('agi'), luk: shrink('luk'),
  };
}

/**
 * ของทุกชิ้นทำตัวเหมือนดรอปที่ชั้นของโซน
 *
 * - `droppedFloor` ตัดลง → main stat คำนวณใหม่จากสูตรเดิม `baseValue + perFloor × floor`
 *   (itemMainStat คิดจาก droppedFloor ตอนสร้างค่า จึงตรงเป๊ะ ไม่ต้องประมาณ)
 * - `upgradeLevel` ตัดลงเหลือไม่เกินเลขชั้น — การอัปเกรดคือพลังที่ซื้อด้วยทอง/วัสดุจากการฟาร์ม
 *   ถ้าไม่ตัด รูเดิมเปิดกลับ: ฟาร์มหอคอย → อัปเกรด → เอามาตีภูมิภาค
 * - ค่าอัฟฟิกซ์ย่อตาม `ชั้นโซน / droppedFloor` เพราะอัฟฟิกซ์ถูกสุ่มตามชั้นที่ดรอป
 *
 * ของที่ดรอปต่ำกว่าชั้นโซนอยู่แล้วไม่ถูกแตะเลย
 */
export function syncEquipment(equipment: ItemInstance[], floor: number): ItemInstance[] {
  return equipment.map((item) => {
    const upgradeLevel = Math.min(item.upgradeLevel, floor);
    if (item.droppedFloor <= floor) {
      return upgradeLevel === item.upgradeLevel ? item : { ...item, upgradeLevel };
    }
    const scale = floor / item.droppedFloor;
    return {
      ...item,
      droppedFloor: floor,
      upgradeLevel,
      affixes: item.affixes.map((a) => ({ ...a, value: Math.round(a.value * scale) })),
    };
  });
}

/**
 * ล็อกทั้งชุดสำหรับการรบหนึ่งครั้งในภูมิภาค
 *
 * ล็อกลงอย่างเดียว ไม่ดึงขึ้น — ผู้เล่นที่เลเวลต่ำกว่าโซนสู้ด้วยค่าจริงของตัวเอง
 * (ของยังถูกล็อกเสมอแม้เลเวลไม่ถึง เพราะของจากหอคอยชั้นสูงคือรูที่ต้องปิดไม่ว่าเลเวลเท่าไร)
 */
export function syncLoadout(
  classId: ClassId, level: number, stats: BaseStats, equipment: ItemInstance[], floor: number,
): SyncedLoadout {
  const target = syncLevelForFloor(floor);
  const synced = level > target;
  return {
    level: synced ? target : level,
    stats: synced ? syncStats(classId, level, stats, target) : { ...stats },
    equipment: syncEquipment(equipment, floor),
    synced,
  };
}
