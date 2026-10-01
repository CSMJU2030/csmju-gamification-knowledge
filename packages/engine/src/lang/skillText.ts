/**
 * ข้อความอธิบายสกิลและกติกา MP สำหรับผู้เล่น (playtest รอบ A ข้อ 5 · 26 ก.ย. 2026)
 *
 * ผู้เล่นรายงานว่า "ตอนสร้าง blox รู้แค่ชื่อสกิล ไม่รู้ว่าทำอะไรได้" — การ์ดสกิลมีแค่ชื่อกับ MP
 * ส่วนคำอธิบายที่มีอยู่ (หน้าเลือกอาชีพ) พิมพ์มือไว้ในหน้าเว็บ และพูดผิดไปหนึ่งข้อแล้ว
 * (ปิดฉาก "แรงเป็นพิเศษกับศัตรูเลือดน้อย" — battle.ts ไม่มีกติกานี้)
 *
 * กติกาของไฟล์นี้: ตัวเลขทุกตัวสร้างจาก SkillDef และ combat-rules.ts ซึ่งเป็นค่าเดียวกับที่ใช้รบ
 * ไม่พิมพ์ตัวเลขซ้ำเอง · ถ้า battle.ts เปลี่ยนวิธีคิดของสกิลชนิดไหน ต้องแก้ที่นี่ด้วย
 * (เทสต์ skill-text.test.ts ยิงสกิลจริงเทียบกับข้อความ)
 *
 * ไฟล์นี้ต้องไม่ import gamedata หรือโมดูลภาษา — หน้าตัวละครของเว็บ import ตรงผ่าน
 * `@tower/engine/skill-text` ถ้าลากตัวแปลภาษาหรือ gamedata มาด้วย JS แรกเข้าของหน้าแรกจะโต ~18 kB
 * ตัวที่ต้องใช้ gamedata (describeSkillById · skillsOfClass) อยู่ใน skills.ts
 */
import {
  BASIC_ATTACK_MP, GUARD_MULT, MP_REGEN_PCT, TAUNT_DAMAGE_REDUCTION, TAUNT_ROUNDS, WAVE_CLEAR_RESTORE,
} from '../combat-rules';
import type { SkillDef } from '../types';

export interface SkillText {
  /** ชนิดแบบสั้น เช่น "กายภาพ" "เวท" "ฮีล" */
  kindTh: string;
  /** ผลเป็นตัวเลข เช่น "ดาเมจ 180% ของ ATK" */
  effectTh: string;
  /** ใช้กับใคร เช่น "ศัตรู 1 ตัว · หลบได้" */
  targetTh: string;
  /** คำอธิบายภาษาคนจาก gamedata (ว่างถ้าไม่มี) */
  descTh: string;
}

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

export function describeSkill(skill: Pick<SkillDef, 'kind' | 'power' | 'aoe'> & { descTh?: string }): SkillText {
  const descTh = skill.descTh ?? '';
  switch (skill.kind) {
    case 'physical':
      return {
        kindTh: 'กายภาพ',
        effectTh: `ดาเมจ ${skill.power}% ของ ATK`,
        // battle.ts: การหลบใช้กับการโจมตีกายภาพเป้าเดี่ยวเท่านั้น
        targetTh: skill.aoe ? 'ศัตรูทุกตัว · หลบไม่ได้' : 'ศัตรู 1 ตัว · หลบได้',
        descTh,
      };
    case 'magic':
      return {
        kindTh: 'เวท',
        effectTh: `ดาเมจ ${skill.power}% ของ MATK`,
        targetTh: skill.aoe ? 'ศัตรูทุกตัว · หลบไม่ได้' : 'ศัตรู 1 ตัว · หลบไม่ได้',
        descTh,
      };
    case 'heal':
      return {
        kindTh: 'ฮีล',
        effectTh: `ฟื้นเลือด ${skill.power}% ของเลือดสูงสุดของเป้า`,
        targetTh: 'ตัวเองหรือพวกเดียวกัน 1 ตัว',
        descTh,
      };
    case 'shield':
      return {
        kindTh: 'โล่',
        effectTh: `โล่ซับดาเมจ ${skill.power}% ของเลือดสูงสุดของผู้ร่าย`,
        targetTh: 'ตัวเองหรือพวกเดียวกัน 1 ตัว',
        descTh,
      };
    case 'taunt':
      return {
        kindTh: 'ยั่วยุ',
        effectTh: `ศัตรูที่ตีเป้าเดี่ยวต้องตีคุณ · รับดาเมจลดลง ${pct(TAUNT_DAMAGE_REDUCTION)}`,
        targetTh: `ตัวเอง · ถึงจบอีก ${TAUNT_ROUNDS} รอบ`,
        descTh,
      };
    default:
      return { kindTh: String(skill.kind), effectTh: '', targetTh: '', descTh };
  }
}

/** ตีธรรมดา — ไว้เทียบกับสกิล */
export const BASIC_ATTACK_TEXT_TH =
  `attack() = ดาเมจ 100% ของ ATK ใส่ศัตรู 1 ตัว และได้ MP +${BASIC_ATTACK_MP}`;

/** defend() — ตัวเลขเดียวกับที่ battle.ts ใช้ */
export const DEFEND_TEXT_TH =
  `defend() = รับดาเมจแค่ ${pct(GUARD_MULT)} จนถึงเทิร์นถัดไปของคุณ (ไม่ได้ตี)`;

/** กติกา MP ที่ผู้เล่นมองไม่เห็นจากหลอด — ทำไมร่ายได้มากกว่า MP เต็มหลอด */
export const MP_RULES_TEXT_TH =
  `MP ฟื้นเอง ${pct(MP_REGEN_PCT)} ของหลอดทุกเทิร์น · +${BASIC_ATTACK_MP} เมื่อตีธรรมดา · +${pct(WAVE_CLEAR_RESTORE)} ตอนเคลียร์เวฟ`;
