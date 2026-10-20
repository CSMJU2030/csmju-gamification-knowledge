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
  BASIC_ATTACK_MP, GUARD_MULT, MP_REGEN_PCT, STUN_IMMUNE_TURNS, TAUNT_DAMAGE_REDUCTION, TAUNT_ROUNDS, WAVE_CLEAR_RESTORE,
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

/** ส่วนของ SkillDef ที่ข้อความใช้ — หน้าเว็บส่งก้อนจาก API มาได้โดยไม่ต้องมี SkillDef เต็ม */
export type DescribableSkill = Pick<SkillDef, 'kind' | 'power' | 'aoe'>
  & Partial<Pick<SkillDef, 'hits' | 'drain' | 'poison' | 'stun' | 'buff'>>
  & {
    descTh?: string;
    /** ยั่วยุ: สัดส่วนดาเมจที่ลด — ไม่ส่ง = ค่าปกติ (ขั้น 2 ส่งค่าของขั้น 2) */
    tauntReduction?: number;
  };

/**
 * กลไกเสริมของสกิลตำรา (ระยะ S4) ต่อท้ายผลหลัก — ตรงกับที่ battle.ts ทำ (applyStatus · หลายฮิต · ดูดเลือด)
 */
function extrasTh(skill: DescribableSkill): string {
  const stat = skill.kind === 'magic' ? 'MATK' : 'ATK';
  const out: string[] = [];
  if (skill.poison) out.push(`ติดพิษ ${skill.poison.turns} เทิร์น เสียเลือดเทิร์นละ ${skill.poison.power}% ของ ${stat} ผู้ร่าย (ไม่หักเกราะ)`);
  if (skill.stun) out.push(`เป้ามึน ข้ามเทิร์นถัดไป (บอสไม่มึน · หายมึนแล้วต้านอีก ${STUN_IMMUNE_TURNS} เทิร์น)`);
  if (skill.drain) out.push(`ฟื้นเลือดตัวเอง ${pct(skill.drain)} ของดาเมจที่ทำได้`);
  return out.length ? ` · ${out.join(' · ')}` : '';
}

export function describeSkill(skill: DescribableSkill): SkillText {
  const descTh = skill.descTh ?? '';
  const hits = skill.hits && skill.hits > 1 ? `${skill.hits} ครั้ง ครั้งละ ` : '';
  switch (skill.kind) {
    case 'physical':
      return {
        kindTh: 'กายภาพ',
        effectTh: `ดาเมจ ${hits}${skill.power}% ของ ATK${extrasTh(skill)}`,
        // battle.ts: การหลบใช้กับการโจมตีกายภาพเป้าเดี่ยวเท่านั้น
        targetTh: skill.aoe ? 'ศัตรูทุกตัว · หลบไม่ได้' : `ศัตรู 1 ตัว · หลบได้${hits ? 'ทีละครั้ง' : ''}`,
        descTh,
      };
    case 'magic':
      return {
        kindTh: 'เวท',
        effectTh: `ดาเมจ ${hits}${skill.power}% ของ MATK${extrasTh(skill)}`,
        targetTh: skill.aoe ? 'ศัตรูทุกตัว · หลบไม่ได้' : 'ศัตรู 1 ตัว · หลบไม่ได้',
        descTh,
      };
    case 'buff':
      return {
        kindTh: 'บัฟ',
        effectTh: skill.buff
          ? `${skill.buff.stat.toUpperCase()} +${skill.buff.pct}% นาน ${skill.buff.turns} เทิร์นถัดไปของคุณ · has_buff("power") เป็นจริง`
          : '',
        targetTh: 'ตัวเอง · ร่ายซ้ำตอนบัฟยังอยู่ = ต่อเวลา',
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
        effectTh: `ศัตรูที่ตีเป้าเดี่ยวต้องตีคุณ · รับดาเมจลดลง ${pct(skill.tauntReduction ?? TAUNT_DAMAGE_REDUCTION)}`,
        targetTh: `ตัวเอง · ถึงจบอีก ${TAUNT_ROUNDS} รอบ`,
        descTh,
      };
    default:
      return { kindTh: String(skill.kind), effectTh: '', targetTh: '', descTh };
  }
}

/**
 * ผลของขั้น 2 (ระยะ S2) แบบสั้น เช่น "ดาเมจ 225% ของ ATK" — null = สกิลนี้ไม่มีขั้น 2
 * สร้างจากค่าเดียวกับที่ battle.ts ใช้ (rankedSkill · tauntCut)
 */
export function describeRank2(skill: DescribableSkill & Pick<SkillDef, 'rank2'>): string | null {
  const r = skill.rank2;
  if (!r) return null;
  const ranked = { ...skill, power: r.power ?? skill.power, descTh: '' };
  if (skill.kind === 'taunt') {
    return describeSkill({ ...ranked, tauntReduction: r.tauntReduction }).effectTh;
  }
  return describeSkill(ranked).effectTh;
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
