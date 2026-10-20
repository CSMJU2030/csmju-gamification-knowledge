/**
 * สกิลที่ตัวละครมี และช่องสกิลของโปรแกรม (docs/design-skill-acquisition.md ข้อ 7–8)
 *
 * สกิลของตัวละครมาจากห้าทาง — ทุกทางเข้าของเซิร์ฟเวอร์ (รบ · ตรวจโปรแกรม · หน้าตัวละคร · สแนปช็อตดวล)
 * เรียก `skillsFor` ตัวเดียวพร้อมข้อมูลของแถวตัวละคร:
 *   1. สกิลอาชีพตามเลเวล (9 ตัวเดิม)
 *   2. สกิลประจำภูมิภาค — พิสูจน์บทเรียนแล้ว (ระยะ S1 · proofs.ts)
 *   3. สกิลจากความชำนาญ — แต้มที่ความชำนาญแจกให้สายนั้นถึงเกณฑ์ (ระยะ S3 · ไฟล์นี้)
 *   4. สกิลจากตำรา — เก็บตำราเล่มนั้นแล้ว (ระยะ S4 · books.ts)
 * ส่วน "ขั้น 2" (ระยะ S2) ไม่ใช่สกิลใหม่ เป็นค่าที่แรงขึ้นของสกิลเดิม (mastery.ts)
 *
 * ทุกทางผูกกับตัวละคร ไม่ผูกกับอาชีพ — ผู้ฝึกหัดที่ได้มาก่อนเลือกอาชีพจะได้สกิลของอาชีพที่เลือกทีหลังทันที
 */
import { gamedata } from './data';
import { resolveSkillName } from './lang/skills';
import type { Expr, Program, Stmt } from './lang/spec';
import type { BaseStats, ClassId, SkillDef, SkillLine } from './types';

/** ข้อมูลของตัวละครที่ใช้ตัดสินว่ามีสกิลอะไร — ช่องที่ไม่ส่ง = ยังไม่มีจากทางนั้น */
export interface SkillSources {
  provedRegions?: readonly string[];
  /** สเตตัสปัจจุบัน (ไม่ใช่ค่าที่ล็อกเลเวล) — ใช้ตัดสินสกิลจากความชำนาญ */
  stats?: BaseStats;
  /** ตำราที่เก็บแล้ว (id ใน gamedata.skillBooks) */
  books?: readonly string[];
}

// ---------------------------------------------------------------- S3 สกิลจากความชำนาญ

export const SKILL_LINES: readonly SkillLine[] = ['str', 'int', 'vit'];

/**
 * แต้มที่ความชำนาญแจกให้แต่ละสายแล้ว = สเตตัสตอนนี้ − สเตตัสเริ่มของผู้ฝึกหัด
 *
 * ทำไมเทียบกับผู้ฝึกหัด ไม่ใช่อาชีพปัจจุบัน: ทุกคนเริ่มเป็นผู้ฝึกหัด และการเลือกอาชีพเปลี่ยนแค่ class_id
 * สเตตัสไม่รีเซ็ต (characters.service chooseClass) — แต้มที่เกินค่าเริ่มจึงมาจากความชำนาญทั้งหมด
 * (สเตตัสในเกมนี้ไม่มีทางอื่นให้โตเลย ผู้เล่นไม่ได้กดแจกเอง)
 */
export function lineProgress(stats: BaseStats): Record<SkillLine, number> {
  const start = gamedata.classes.novice.baseStats;
  return {
    str: Math.max(0, stats.str - start.str),
    int: Math.max(0, stats.int - start.int),
    vit: Math.max(0, stats.vit - start.vit),
  };
}

/** สกิลสายของอาชีพนี้ (ผู้ฝึกหัดไม่มี) */
export function lineSkillFor(classId: ClassId | string, line: SkillLine): SkillDef | undefined {
  return gamedata.skills.find((s) => s.line === line && s.classId === classId);
}

function hasLine(stats: BaseStats | undefined, line: SkillLine): boolean {
  return !!stats && lineProgress(stats)[line] >= gamedata.acquisition.lineThreshold;
}

// ---------------------------------------------------------------- รวมทุกทาง

/**
 * สกิลทั้งหมดที่ตัวละครใช้ได้ เรียงตามลำดับใน gamedata (คงที่ทุกครั้ง)
 * รูปเดิม `skillsFor(classId, level, provedRegions)` ยังใช้ได้ (ระยะ S1)
 */
export function skillsFor(
  classId: ClassId | string,
  level: number,
  sources: readonly string[] | SkillSources = {},
): SkillDef[] {
  const src: SkillSources = Array.isArray(sources) ? { provedRegions: sources as readonly string[] } : (sources as SkillSources);
  const proved = src.provedRegions ?? [];
  const books = src.books ?? [];
  return gamedata.skills.filter((s) => {
    if (s.classId !== classId) return false;
    if (s.region) return proved.includes(s.region);
    if (s.line) return hasLine(src.stats, s.line);
    if (s.book) return books.includes(s.book);
    return s.unlockLevel <= level;
  });
}

/** ที่มาของสกิลแบบสั้น — หน้าเว็บใช้จัดกลุ่ม */
export type SkillSource = 'level' | 'region' | 'line' | 'book';

export function sourceOf(skill: SkillDef): SkillSource {
  if (skill.region) return 'region';
  if (skill.line) return 'line';
  if (skill.book) return 'book';
  return 'level';
}

// ---------------------------------------------------------------- ช่องสกิล

/** จำนวนชนิดสกิลที่ใช้ใน cast() ได้ในโปรแกรมเดียว ตามเลเวล */
export function skillSlotsFor(level: number): number {
  return gamedata.acquisition.slotLevels.filter((l) => l <= level).length;
}

/** เลเวลที่ได้ช่องถัดไป (null = ได้ครบแล้ว) */
export function nextSlotLevel(level: number): number | null {
  return gamedata.acquisition.slotLevels.find((l) => l > level) ?? null;
}

function walkExpr(e: Expr, out: (e: Expr) => void): void {
  out(e);
  switch (e.kind) {
    case 'attr': walkExpr(e.obj, out); break;
    case 'call': for (const a of e.args) walkExpr(a, out); break;
    case 'compare': walkExpr(e.left, out); walkExpr(e.right, out); break;
    case 'boolop': for (const v of e.values) walkExpr(v, out); break;
    case 'unary': walkExpr(e.operand, out); break;
    case 'binop': walkExpr(e.left, out); walkExpr(e.right, out); break;
    default: break;
  }
}

function walkStmts(stmts: Stmt[], out: (e: Expr) => void): void {
  for (const s of stmts) {
    switch (s.kind) {
      case 'if': walkExpr(s.test, out); walkStmts(s.body, out); walkStmts(s.orelse, out); break;
      case 'expr': walkExpr(s.value, out); break;
      case 'assign': walkExpr(s.value, out); break;
      case 'for': walkExpr(s.iter, out); walkStmts(s.body, out); break;
      default: break;
    }
  }
}

/**
 * ชนิดสกิลที่โปรแกรม cast() เรียงตามที่เจอครั้งแรกในโค้ด (บนลงล่าง) — ลำดับเดียวกับที่ตัวตรวจโปรแกรมนับช่อง
 * ชื่อที่ไม่มีในเกมถูกข้าม (ตัวตรวจโปรแกรมฟ้องอยู่แล้ว)
 */
export function programSkillIds(program: Program): string[] {
  const out: string[] = [];
  walkStmts(program.turn, (e) => {
    if (e.kind !== 'call' || e.func !== 'cast' || e.args[0]?.kind !== 'str') return;
    const id = resolveSkillName(e.args[0].value)?.id;
    if (id && !out.includes(id)) out.push(id);
  });
  return out;
}

/**
 * สกิลที่พกเข้าการรบจริง — สกิลที่มีและโปรแกรมใช้ ไม่เกินจำนวนช่อง (ตัวแรก ๆ ตามลำดับในโค้ด)
 *
 * โปรแกรมที่บันทึกหลังมีช่องสกิลผ่านตัวตรวจมาแล้วจึงไม่เกินเสมอ (ช่องมีแต่เพิ่มตามเลเวล)
 * ตัวนี้มีไว้ให้โปรแกรมที่บันทึกก่อนมีกติกานี้ — ตัดเหมือนตัวตรวจโปรแกรม แทนการให้รบด้วยสกิลเกินช่องต่อไปเงียบ ๆ
 * สกิลที่ตัดออกถูก cast() ตอนรบ = ข้ามพร้อมคำเตือน "ยังไม่มีบล็อกสกิล" แบบเดียวกับสกิลที่ไม่มี
 */
export function loadoutSkills(owned: readonly string[], program: Program | null, slots: number): string[] {
  if (!program) return [...owned];
  const used = programSkillIds(program).filter((id) => owned.includes(id));
  return used.slice(0, Math.max(0, slots));
}

/** สกิลของอาชีพตามเลเวลที่ยังไม่ได้ปลด — หน้าเว็บใช้บอก "ได้ที่เลเวล…" */
export function levelSkillsOf(classId: ClassId | string): SkillDef[] {
  return gamedata.skills.filter((s) => s.classId === classId && !s.region && !s.line && !s.book);
}

