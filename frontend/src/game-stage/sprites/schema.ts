/**
 * Sprite contract สำหรับเฟส 2A — PM เป็นเจ้าของไฟล์นี้ ห้ามแก้โครงสร้างโดยไม่ผ่าน PM
 *
 * แนวคิด: สไปรต์ทั้งหมดเก็บเป็น "ข้อมูลตัวอักษร" ไม่ใช่ไฟล์ภาพ
 *   - แก้ได้ในเอดิเตอร์ข้อความ, เห็น diff ใน git ว่าเปลี่ยนพิกเซลไหน
 *   - ไม่ต้องมี asset pipeline, ไฟล์เล็ก, subagent สร้าง/แก้เองได้
 * เรนเดอร์ด้วย <canvas> + imageSmoothingEnabled = false (nearest-neighbor) ให้คมแบบ 16-bit
 */

/** สถานะแอนิเมชันของตัวละคร (ทุกตัวต้องมีครบ 4 สถานะ) */
export type AnimState =
  | 'idle'   // ยืนหายใจ — วนลูป (แนะนำ 2 เฟรม)
  | 'act'    // โจมตี/ร่ายเวท — เล่นครั้งเดียว (แนะนำ 2 เฟรม)
  | 'hit'    // โดนตี — เล่นครั้งเดียว (1 เฟรมพอ ตัวเล่นจะเขย่า+กะพริบแดงให้เอง)
  | 'down';  // ล้ม/ตาย — ค้างเฟรมสุดท้าย (1 เฟรม)

/**
 * หนึ่งเฟรม = อาเรย์ของสตริง แต่ละสตริง = 1 แถวพิกเซล แต่ละตัวอักษร = 1 พิกเซล
 * ตัวอักษรต้องมีใน palette เสมอ ยกเว้น '.' = โปร่งใส (สงวนไว้ ห้ามใช้ใน palette)
 * แถวไม่จำเป็นต้องยาวเท่ากัน — ตัวเรนเดอร์จะเติม '.' ด้านขวาให้เอง
 */
export type Frame = string[];

export interface SpriteDef {
  /** ขนาดกล่องสไปรต์ (พิกเซลในความละเอียดฐาน 256x160) */
  w: number;
  h: number;
  /** map ตัวอักษร -> สีฐานสิบหก เช่น { "o": "#141024", "n": "#54ad68" } */
  palette: Record<string, string>;
  frames: Record<AnimState, Frame[]>;
}

/**
 * id ของสไปรต์:
 *   'class:warrior' | 'class:mage' | 'class:guardian'   (มุมมองด้านหลัง)
 *   'mon:<archetypeId>'   เช่น 'mon:goblin'             (หันหน้าเข้ากล้อง)
 *   'boss:<bossId>'       เช่น 'boss:king_slime'        (ถ้าไม่มี จะใช้ mon: ของ archetype แล้วขยาย+ใส่มงกุฎ)
 */
export type SpriteId = string;

export type SpriteSheet = Record<SpriteId, SpriteDef>;

// ---------- ขนาดมาตรฐาน (ให้สัดส่วนในฉากถูกต้อง) ----------
export const SIZE = {
  /** ตัวผู้เล่น อยู่ใกล้กล้อง — ใหญ่สุด */
  player: { w: 32, h: 44 },
  /** มอนสเตอร์ปกติ อยู่ไกล */
  monster: { w: 22, h: 26 },
  /** บอส — ใหญ่กว่ามอนปกติชัดเจน */
  boss: { w: 34, h: 38 },
} as const;

// ---------- ความละเอียดฉาก ----------
export const SCENE = {
  baseW: 256,
  baseH: 160,
  scale: 5,            // 256*5 x 160*5 = 1280x800
  horizonY: 70,
} as const;

/**
 * รายชื่อแอนิเมชันเอฟเฟกต์ที่ต้องมี (ผูกกับ field `animation` ของสกิลใน gamedata.json)
 * ui-dev เขียนฟังก์ชันวาดหนึ่งตัวต่อหนึ่งชื่อ — เพิ่มสกิลใหม่ภายหลัง = เขียนเพิ่มทีละตัว
 */
export const EFFECT_ANIMATIONS = [
  'slash',            // โจมตีปกติ: รอยฟันโค้งขาวพาดตัวเป้า
  'slash_heavy',      // ฟันหนัก: รอยใหญ่ + จอสั่น + แฟลชขาว
  'bash',             // กระแทกด้วยโล่: วงกระแทก + เป้าถอยหลัง
  'bite',             // กัด: รอยเขี้ยวสองรอย
  'spin',             // หมุนตัว: วงลมรอบตัวผู้ใช้ โดนศัตรูทุกตัว
  'projectile_fire',  // ลูกไฟพุ่งข้ามสนาม + หางไฟ + ระเบิด
  'projectile_dark',  // ศรมืดพุ่ง + หางม่วง
  'rain_ice',         // เกล็ดน้ำแข็งตกทั้งจอ + จอแวบฟ้า (AoE)
  'heal_ring',        // วงแสงเขียวลอยขึ้นจากเป้า
  'shield_dome',      // โดมโล่ฟ้าครอบตัว
  'taunt_aura',       // คลื่นสีส้มแผ่จากผู้ใช้ + ไอคอนโกรธ
  'roar_wave',        // คลื่นเสียงแผ่ทั้งจอ + จอสั่น (AoE)
] as const;

export type EffectAnimation = (typeof EFFECT_ANIMATIONS)[number];

/** ระยะเวลาแอนิเมชันมาตรฐาน (ms) ที่ความเร็ว x1 — ตัวเล่นหารด้วย speed multiplier */
export const TIMING = {
  actWindup: 180,     // ตัวละครเข้าท่า act ก่อนเอฟเฟกต์ออก
  effect: 420,        // เอฟเฟกต์หลัก
  impact: 160,        // เป้าเข้าสถานะ hit + ตัวเลขดาเมจลอย
  settle: 140,        // กลับสู่ idle
} as const;
