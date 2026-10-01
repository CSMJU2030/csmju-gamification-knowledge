/**
 * ข้อความไทยของเกม — ย้ายจาก client/src/labels.ts เดิม (ตัดไอคอน emoji ออกตาม UI-04 และตัดส่วน Gambit ที่เลิกใช้แล้ว)
 * ค่าที่ backend ส่งชื่อไทยมาให้ (สกิล ไอเทม affix อาชีพ) ใช้ของ backend ก่อน ตารางนี้เป็นค่าสำรอง
 */
import type { ClassId, PlayableClassId } from '@tower/engine/types';
import type { EquipSlot, GameData, Rarity } from '@/lib/api/types';

// ---------- Classes ----------
export const CLASS_NAMES: Record<ClassId, string> = {
  novice: 'ผู้ฝึกหัด',
  warrior: 'นักรบ',
  mage: 'จอมเวท',
  guardian: 'ผู้พิทักษ์',
};

export const CLASS_DESCRIPTIONS: Record<ClassId, string> = {
  novice: 'ยังไม่เลือกทาง — ใช้ได้แค่โจมตี ตั้งการ์ด และรอ',
  warrior: 'สายโจมตีกายภาพ ดาเมจต่อเนื่อง ทนทานปานกลาง',
  mage: 'สายเวท/ฮีล เบิร์สแรงและโจมตีวงกว้าง แต่ตัวบาง',
  guardian: 'สายป้องกัน ยั่วยุศัตรูและกางโล่ช่วยทีม',
};

/**
 * เนื้อหาหน้าจอ "เลือกอาชีพ" (รอบ 2P §3.3)
 *
 * ทำไมไม่ใช้ CLASS_DESCRIPTIONS ซ้ำ: คำอธิบายชุดนั้นเขียนด้วยศัพท์เกม ("สาย AoE",
 * "เบิร์ส") ซึ่งคนที่เพิ่งผ่านชั้น 1 ยังไม่รู้จัก ชุดนี้จึงเขียนใหม่ทั้งหมดโดยพูดถึง
 * **สิ่งที่เขาเพิ่งเห็นมาจากการรบจริง** และบอกว่า "โปรแกรมของคุณจะสั่งอะไรได้เพิ่ม"
 * เพราะอาชีพในเกมนี้แปลว่า "มีสกิลอะไรให้เรียกใน cast()" ไม่ใช่แค่ตัวเลขสเตตัส
 */
export interface ClassGuide {
  /** พาดหัวสั้น ๆ ว่าเล่นสายนี้แล้วเทิร์นหนึ่งหน้าตาเป็นยังไง */
  playTh: string;
  /** โปรแกรมของผู้เล่นจะเขียนแบบไหน — ผูกกับ §3.2 (สเตตัสโตจากสิ่งที่โปรแกรมทำ) */
  programTh: string;
  // รายชื่อสกิลของอาชีพไม่อยู่ที่นี่แล้ว (26 ก.ย. 2026) — อ่านจาก gamedata + describeSkill() ของ engine
  // ฉบับพิมพ์มือเคยพูดผิดว่าปิดฉาก "แรงเป็นพิเศษกับศัตรูเลือดน้อย" ซึ่ง engine ไม่มีกติกานี้
  /** ความชำนาญที่สายนี้ดันขึ้นเป็นหลัก (ชื่อช่องต้องตรงกับแถบในหน้าตัวละคร) */
  growsTh: string;
  /** จุดอ่อน/สิ่งที่ต้องระวัง — ไม่ปิด เพราะเลือกแล้วเปลี่ยนไม่ได้ */
  careTh: string;
}

export const CLASS_GUIDE: Record<PlayableClassId, ClassGuide> = {
  warrior: {
    playTh: 'เข้าไปตีทุกเทิร์น ใครเลือดน้อยเก็บก่อน',
    programTh:
      'โปรแกรมส่วนใหญ่เป็น attack() แล้วแทรก cast() ตอน MP พอ — เขียนง่ายที่สุดในสามสาย เหมาะถ้ายังไม่อยากเขียน if เยอะ',
    growsTh: 'STR',
    careTh: 'ไม่มีท่าฮีล เลือดหายแล้วหายเลย MP หมดเมื่อไหร่ก็เหลือแค่ตีธรรมดา',
  },
  mage: {
    playTh: 'ยืนหลังแล้วยิงเวท เลือดน้อยเมื่อไหร่ฮีลตัวเองก่อน',
    programTh:
      'ต้องมี if ตั้งแต่แรก ๆ เพราะ MP หมดแล้วร่ายไม่ได้ และตัวบางที่สุด — โปรแกรมที่ยิงอย่างเดียวจะตายก่อนใช้ท่าไม้ตาย',
    growsTh: 'INT',
    careTh: 'เลือดน้อยสุดในสามสาย โดนรุมสองสามเทิร์นก็ล้ม',
  },
  guardian: {
    playTh: 'รับให้อยู่ก่อน ค่อยสวนตอนปลอดภัย',
    programTh:
      'เทิร์นที่คุณเลือก defend() ยั่วยุ หรือกางโล่ ไม่ใช่เทิร์นที่เสียเปล่า — มันคือ "งาน" ที่ทำให้ VIT ขึ้น สายนี้จึงเขียน if เยอะที่สุด',
    growsTh: 'VIT',
    careTh: 'ดาเมจต่อเทิร์นน้อยที่สุด ถ้าเขียนแต่รับไม่สวนเลย จะฆ่าศัตรูไม่ทันแล้วแพ้เพราะยืดเยื้อ',
  },
};

// ---------- ความชำนาญ (รอบ 2P §3.2) — สามช่องเท่านั้น AGI/LUK โตเอง ----------
export const PROFICIENCY_INFO: Record<'str' | 'int' | 'vit', { key: string; th: string; howTh: string }> = {
  str: { key: 'STR', th: 'พลังกาย', howTh: 'ตีด้วย attack() และสกิลกายภาพ — นับจากเลือดที่ฟันหายไป' },
  int: { key: 'INT', th: 'สติปัญญา', howTh: 'ร่ายเวทหรือฮีลด้วย cast() — นับจากเลือดที่เวทเอาไปและที่ฮีลคืนมา' },
  vit: { key: 'VIT', th: 'ความอึด', howTh: 'ทุกเทิร์นที่เลือกเล่นรับ — defend() ยั่วยุ กางโล่ และดาเมจที่รับไว้แล้วรอด' },
};

export const STAT_SHORT: Record<'str' | 'int' | 'vit' | 'agi' | 'luk', { key: string; th: string }> = {
  str: { key: 'STR', th: 'พลังกาย' },
  int: { key: 'INT', th: 'สติปัญญา' },
  vit: { key: 'VIT', th: 'ความอึด' },
  agi: { key: 'AGI', th: 'ความคล่อง' },
  luk: { key: 'LUK', th: 'โชค' },
};

export const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'อาวุธ',
  armor: 'เกราะ',
  helmet: 'หมวก',
  accessory: 'เครื่องประดับ',
};
export const SLOTS: EquipSlot[] = ['weapon', 'armor', 'helmet', 'accessory'];

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'ธรรมดา',
  uncommon: 'ไม่ธรรมดา',
  rare: 'หายาก',
  epic: 'มหากาพย์',
  legendary: 'ตำนาน',
};

/** ระดับความหายาก → tone ของ StatusBadge (สีกลางเท่านั้น ไม่ใช้สีเกม) */
export const RARITY_TONE: Record<Rarity, 'neutral' | 'success' | 'info' | 'warning' | 'error'> = {
  common: 'neutral',
  uncommon: 'success',
  rare: 'info',
  epic: 'warning',
  legendary: 'error',
};

export const MAIN_STAT_LABELS: Record<string, string> = {
  atk: 'โจมตี',
  matk: 'พลังเวท',
  def: 'ป้องกัน',
  mdef: 'ต้านเวท',
};

const AFFIX_FALLBACK: Record<string, string> = {
  atk_pct: 'โจมตี %',
  matk_pct: 'เวท %',
  hp_pct: 'HP %',
  def_pct: 'ป้องกัน %',
  speed_flat: 'ความเร็ว +',
  crit_rate: 'อัตราคริ %',
  crit_dmg: 'แรงคริ %',
  evasion: 'หลบหลีก %',
  lifesteal: 'ดูดเลือด %',
  mp_flat: 'MP +',
  drop_bonus: 'โบนัสดรอป %',
  exp_bonus: 'โบนัส EXP %',
};

/**
 * บรรทัด affix พร้อมแสดง เช่น "โจมตี +8%" / "MP +25"
 * ชื่อจาก game-data มีหน่วยห้อยท้าย ("โจมตี %", "MP +") จึงตัดหน่วยออกก่อนประกอบใหม่
 */
export function affixLine(stat: string, value: number, gamedata: GameData | null): string {
  const raw = (gamedata?.affixNames?.[stat] ?? AFFIX_FALLBACK[stat] ?? stat).trim();
  const isPct = raw.endsWith('%');
  const label = raw.replace(/[+%]\s*$/, '').trim();
  return `${label} +${value}${isPct ? '%' : ''}`;
}

export const SKILL_KIND_LABELS: Record<string, string> = {
  physical: 'กายภาพ',
  magic: 'เวทมนตร์',
  heal: 'ฟื้นฟู',
  shield: 'โล่',
  taunt: 'ยั่วยุ',
};

export function skillName(skillId: string | undefined, gamedata: GameData | null): string {
  if (!skillId) return 'สกิล';
  return gamedata?.skills.find((s) => s.id === skillId)?.nameTh ?? skillId;
}

export function fmt(n: number): string {
  return n.toLocaleString('th-TH');
}

export function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

/** บทบาทบน PageHeader หน้าแรก (G0 ข้อ 4) */
export const ROLE_BADGE: Record<string, string> = {
  PLAYER: 'ผู้เล่น',
  INSTRUCTOR: 'ผู้สอน Code Tower',
  ADMIN: 'ผู้ดูแล Code Tower',
};

export const ROLE_TH: Record<string, string> = {
  student: 'นักศึกษา',
  alumni: 'ศิษย์เก่า',
  staff: 'บุคลากร',
  lecturer: 'อาจารย์',
  guest: 'ผู้เยี่ยมชม',
  admin: 'ผู้ดูแลระบบ',
};

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
