/**
 * แปลง CombatEvent หนึ่งตัว → บรรทัดในบันทึกการรบแบบข้อความ
 *
 * แยกออกจาก director เพราะบันทึกนี้เป็น "ทางเลือกที่เท่ากัน" ของฉากทั้งฉาก (G0 ข้อ 5.3 —
 * อ่านด้วย screen reader ได้) ไม่ใช่ของแถมของแอนิเมชัน ข้อความต้องออกมาเหมือนกันเป๊ะ
 * ไม่ว่าจะเล่นแบบมีแอนิเมชัน · ภาพนิ่ง (prefers-reduced-motion) · หรือข้ามไปผลลัพธ์
 * การเป็นฟังก์ชันบริสุทธิ์ทำให้ทดสอบข้อความไทยได้โดยไม่ต้องมี canvas
 *
 * ข้อความยกมาจาก director เดิมทุกบรรทัด ตัด emoji ออก (UI-04) — ชนิดของบรรทัด (kind)
 * ทำหน้าที่แทน emoji แล้วให้หน้าจอเลือกเครื่องหมายจาก token กลางเอง
 */
import type { CombatEvent } from '@/lib/api/types';
import { fmt } from '@/lib/game/labels';

/** จำนวนเวฟต่อการรบหนึ่งครั้ง (หอคอยและโซนเท่ากัน) */
export const MAX_WAVE = 10;

export type LogKind = 'normal' | 'wave' | 'kill' | 'heal' | 'system';

export interface LogEntry {
  text: string;
  kind: LogKind;
}

export interface LogContext {
  /** ชื่อไทยของสกิล — ไม่รู้จักให้คืน id เดิม (ห้ามเดาชื่อ) */
  skillName: (skillId: string | undefined) => string;
  /** ฉากดวล: ไม่มี 10 เวฟ event ของระบบจึงหมายถึงเริ่ม/จบการดวล */
  duel?: boolean;
  /** จำนวนเวฟทั้งหมด (เว้นไว้ = 10) — ตัวอย่างอาชีพมีแค่ 3 เวฟ */
  waveTotal?: number;
}

export function describeEvent(ev: CombatEvent, ctx: LogContext): LogEntry[] {
  if (ev.note === 'wave_start' || ev.note === 'wave_clear') {
    if (ctx.duel) {
      return [{ text: ev.note === 'wave_start' ? 'เริ่มการดวล' : 'จบการดวล', kind: 'wave' }];
    }
    return [
      ev.note === 'wave_start'
        ? { text: `เวฟ ${ev.wave}/${ctx.waveTotal ?? MAX_WAVE} เริ่มต้น`, kind: 'wave' }
        : { text: `เคลียร์เวฟ ${ev.wave} แล้ว`, kind: 'wave' },
    ];
  }

  if (ev.action === 'defend' || ev.note === 'defend') {
    return [{ text: `${ev.actorName} ตั้งท่าป้องกัน`, kind: 'normal' }];
  }

  // wait() — เทิร์นที่ไม่ทำอะไรแต่ MP ยังฟื้น (เดิมไม่มีบรรทัดนี้ ผู้เล่นไม่รู้ว่าเทิร์นหายไปไหน)
  if (ev.action === 'wait') {
    const mp = typeof ev.mpAfter === 'number' ? ` · MP เป็น ${fmt(ev.mpAfter)}` : '';
    return [{ text: `${ev.actorName} รอ 1 เทิร์น${mp}`, kind: 'normal' }];
  }

  /*
   * รอบ 2M: ตั้งท่าหมายหัว — ไม่มีดาเมจ แต่เป็นบรรทัดที่สำคัญที่สุดของเวฟนั้น
   * เพราะมันคือ "ช่วงที่ has_debuff("marked") เป็นจริง" ผู้เล่นต้องเห็นว่าโค้ดของตัวเองตอบทันไหม
   */
  if (ev.note === 'windup') {
    return ev.targets.map((t) => ({
      text: `${ev.actorName} ง้างรอ — หมายหัว ${t.name} ไว้ เทิร์นหน้าของมันจะทุบแรง · has_debuff("marked") เป็นจริงตอนนี้`,
      kind: 'system' as const,
    }));
  }

  const usedSkill = ev.action === 'skill';
  const sName = usedSkill ? ctx.skillName(ev.skillId) : '';
  const out: LogEntry[] = [];

  for (const t of ev.targets) {
    if (t.evaded) {
      out.push({
        text: usedSkill
          ? `${ev.actorName} ใช้ ${sName} ใส่ ${t.name} — พลาด! ${t.name} หลบได้`
          : `${ev.actorName} โจมตี ${t.name} — พลาด! ${t.name} หลบได้`,
        kind: 'normal',
      });
      continue;
    }

    if (typeof t.damage === 'number') {
      const crit = t.crit ? ' ติดคริ!' : '';
      out.push({
        text: usedSkill
          ? `${ev.actorName} ใช้ ${sName} ใส่ ${t.name} — ${fmt(t.damage)} ดาเมจ${crit}`
          : `${ev.actorName} โจมตี ${t.name} — ${fmt(t.damage)} ดาเมจ${crit}`,
        kind: 'normal',
      });
    }

    if (typeof t.heal === 'number') {
      out.push({ text: `${ev.actorName} ใช้ ${sName} — ${t.name} ฟื้นฟู ${fmt(t.heal)} HP`, kind: 'heal' });
    }

    if (typeof t.shield === 'number') {
      out.push({ text: `${ev.actorName} ใช้ ${sName} — ${t.name} ได้โล่ ${fmt(t.shield)}`, kind: 'heal' });
    }

    if (t.damage === undefined && t.heal === undefined && t.shield === undefined && usedSkill) {
      out.push({ text: `${ev.actorName} ใช้ ${sName} ใส่ ${t.name}`, kind: 'normal' });
    }

    if (t.killed) {
      out.push({ text: `${t.name} ล้มลง!`, kind: 'kill' });
    }
  }
  return out;
}

/** บันทึกทั้งการรบในครั้งเดียว — ใช้กับการทดสอบและกับผู้ที่ต้องการอ่านย้อนทั้งหมด */
export function buildBattleLog(events: CombatEvent[], ctx: LogContext): LogEntry[] {
  return events.flatMap((ev) => describeEvent(ev, ctx));
}
