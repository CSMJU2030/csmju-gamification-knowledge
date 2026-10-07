/**
 * มอนของโจทย์ — อาจารย์ออกแบบมอนให้นักศึกษาสู้ (docs/design-challenge-monsters.md)
 *
 * ไฟล์นี้มีแค่ "กติกา" (ขอบเขตค่า · ตรวจ · รางวัล) — หน้าเว็บ import ไปใช้ในฟอร์มได้โดยไม่ลากตัวจำลองการรบมาด้วย
 * การสร้างเวฟและการรบอยู่ที่ `challenge-battle.ts`
 *
 * ขอบเขตค่าอยู่ที่ `CHALLENGE_MONSTER_LIMITS` ที่เดียว ใช้ทั้งตรวจฝั่ง backend และฟอร์มฝั่งหน้าเว็บ
 */
import { gamedata } from './data';
import { parse } from './lang/parser';
import { preferredSkillName } from './lang/skills';
import { MAX_PROGRAM_LINES, unlockedFeatures, type LangError } from './lang/spec';
import { validate } from './lang/validate';
import { FORMULAS, PLAYABLE_CLASSES } from './types';

export const CHALLENGE_MONSTER_LIMITS = {
  maxMonsters: 4,
  nameMax: 40,
  levelMin: 1,
  levelMax: 50,
  hpMultMin: 0.5,
  hpMultMax: 5,
  dmgMultMin: 0.5,
  dmgMultMax: 3,
  skillsMin: 1,
  skillsMax: 3,
} as const;

/**
 * สกิลที่อาจารย์เลือกให้มอนได้ — `mon_windup` / `mon_crush` เป็นกลไกตั้งท่าทุบของโซน
 * (ทำงานผ่าน `windupEvery` ไม่ใช่ผ่านโปรแกรม) จึงไม่เปิดในรอบนี้
 */
export const CHALLENGE_MONSTER_SKILLS = ['mon_bite', 'mon_dark_bolt', 'mon_roar'] as const;

/** มอนหนึ่งตัวที่อาจารย์ตั้ง — รูปเดียวกับที่เก็บในตาราง challenge_monsters */
export interface ChallengeMonsterSpec {
  name: string;
  archetypeId: string;
  level: number;
  hpMult: number;
  dmgMult: number;
  /** ว่าง = สกิลของต้นแบบ */
  skills: string[];
  /** null/ไม่ส่ง = พฤติกรรมตามบทบาทของต้นแบบ (gamedata.monsterPrograms) */
  programSource?: string | null;
}

/** ข้อผิดพลาดของช่องหนึ่ง — `field` ใช้ path แบบ `monsters.0.level` ให้ทั้ง API และฟอร์มชี้ช่องได้ */
export interface ChallengeMonsterIssue {
  field: string;
  messageTh: string;
}

const L = CHALLENGE_MONSTER_LIMITS;

/**
 * id ของมอนตัวที่ i (เริ่ม 1 = `position` ในตาราง) — มี archetype ต่อท้ายแบบเดียวกับหอคอย หน้าเว็บอ่านภาพจาก monsterId อยู่แล้ว
 * อยู่ในไฟล์กติกาเพื่อให้หน้าเว็บจับคู่ combatant ในฉากรบกับมอนที่ผู้สอนตั้ง (เช่น เลเวลของแต่ละตัว) ได้โดยไม่ลากตัวจำลองการรบมา
 */
export const challengeMonsterId = (i: number, archetypeId: string) => `ch_m${i}_${archetypeId}`;

export function challengeArchetype(id: string) {
  return gamedata.monsterArchetypes.find((a) => a.id === id);
}

/** ต้นแบบที่ผู้สอนเลือกได้ — ภาพ (`mon:<id>`) · บทบาท · สกิลเริ่มต้น · โปรแกรมตามบทบาท (ใช้เมื่อไม่เขียนเอง) */
export interface ChallengeArchetypeInfo {
  id: string;
  nameTh: string;
  role: string;
  skills: string[];
  defaultProgram: string;
}

export function challengeArchetypes(): ChallengeArchetypeInfo[] {
  return gamedata.monsterArchetypes.map((a) => ({
    id: a.id,
    nameTh: a.nameTh,
    role: a.role,
    skills: [...a.skills],
    defaultProgram: gamedata.monsterPrograms[a.role] ?? gamedata.monsterPrograms.default ?? '',
  }));
}

/** สกิลที่ผู้สอนเลือกให้มอนได้ พร้อมชื่อที่ใช้ใน `cast("…")` ของโปรแกรมมอน */
export interface ChallengeSkillInfo {
  id: string;
  nameTh: string;
  castName: string;
  kind: string;
  aoe: boolean;
  mpCost: number;
  power: number;
}

export function challengeSkillInfo(): ChallengeSkillInfo[] {
  return CHALLENGE_MONSTER_SKILLS.map((id) => {
    const s = gamedata.skills.find((x) => x.id === id);
    if (!s) throw new Error(`unknown skill ${id}`);
    return { id, nameTh: s.nameTh, castName: preferredSkillName(id), kind: s.kind, aoe: s.aoe, mpCost: s.mpCost, power: s.power };
  });
}

/** สกิลที่มอนตัวนี้ใช้จริง — อาจารย์ไม่เลือก = ของต้นแบบ */
export function challengeMonsterSkills(spec: Pick<ChallengeMonsterSpec, 'archetypeId' | 'skills'>): string[] {
  if (spec.skills.length > 0) return [...spec.skills];
  return [...(challengeArchetype(spec.archetypeId)?.skills ?? [])];
}

const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

/**
 * ตรวจโปรแกรมด้วยไวยากรณ์ทุกชุดที่ผู้เล่นปลดล็อกได้ · สกิลเท่าที่ให้มา
 * ใช้กับโปรแกรมที่ผู้สอนเขียน: โปรแกรมของมอน และโปรแกรมของตัวละครตัวอย่างตอนทดลองสู้ (ข้อ M7)
 */
export function checkProgramWithSkills(source: string, skills: string[]): LangError[] {
  const lines = source.split('\n');
  let count = lines.length;
  while (count > 0 && lines[count - 1].trim() === '') count--;
  if (count > MAX_PROGRAM_LINES) {
    return [{
      name: 'SyntaxError',
      messageTh: `โปรแกรมยาว ${count} บรรทัด เกินขีดจำกัด ${MAX_PROGRAM_LINES} บรรทัด`,
      line: MAX_PROGRAM_LINES + 1,
      col: 1,
    } as LangError];
  }
  const parsed = parse(source);
  if (!parsed.program) return parsed.errors;
  // ชั้นสูงพอให้ปลดทุกไวยากรณ์ที่ผู้เล่นปลดได้ (userfunc ปิดสำหรับทุกคน)
  return validate(parsed.program, { features: unlockedFeatures(Number.MAX_SAFE_INTEGER - 1), availableSkills: skills }).errors;
}

/**
 * ตรวจโปรแกรมของมอน — สกิลเท่าที่มอนตัวนี้มี
 * (ตัวแปลและตัวตรวจตัวเดียวกับโปรแกรมของผู้เล่น · ตอนรบถูกจำกัดงบต่อเทิร์นเหมือนกัน)
 */
export function checkMonsterProgram(source: string, skills: string[]): LangError[] {
  return checkProgramWithSkills(source, skills).map((e) => forMonster(e, skills));
}

/**
 * ตัวตรวจเขียนข้อความ "ยังใช้สกิล 'x' ไม่ได้ — เป็นสกิลของ<อาชีพ> ปลดที่เลเวล n · สกิลที่คุณใช้ได้ตอนนี้" ให้ผู้เล่น
 * แต่มอนไม่มีอาชีพหรือเลเวลปลดสกิล — สิ่งที่ผู้สอนแก้ได้คือเลือกสกิลนั้นให้มอน หรือใช้สกิลที่มอนมีอยู่
 */
const UNOWNED_SKILL = /^ยังใช้สกิล '([^']+)' ไม่ได้/;

function forMonster(e: LangError, skills: string[]): LangError {
  const m = UNOWNED_SKILL.exec(e.messageTh);
  if (!m) return e;
  const owned = skills.map(preferredSkillName).join(', ') || '—';
  return { ...e, messageTh: `มอนตัวนี้ไม่มีสกิล '${m[1]}' — เลือกสกิลนี้ในช่องสกิลของมอน หรือใช้สกิลที่มอนมี: ${owned}` };
}

/** ตรวจมอนทั้งชุดของโจทย์ — คืนรายการปัญหา (ว่าง = ใช้ได้) */
export function challengeMonsterIssues(specs: ChallengeMonsterSpec[]): ChallengeMonsterIssue[] {
  const issues: ChallengeMonsterIssue[] = [];
  if (specs.length > L.maxMonsters) {
    issues.push({ field: 'monsters', messageTh: `มอนของโจทย์มีได้ไม่เกิน ${L.maxMonsters} ตัว` });
  }
  specs.forEach((m, i) => {
    const at = (f: string) => `monsters.${i}.${f}`;
    const name = typeof m.name === 'string' ? m.name.trim() : '';
    if (name.length === 0) issues.push({ field: at('name'), messageTh: 'ตั้งชื่อมอน' });
    else if (name.length > L.nameMax) issues.push({ field: at('name'), messageTh: `ชื่อมอนยาวได้ไม่เกิน ${L.nameMax} ตัวอักษร` });
    if (!challengeArchetype(m.archetypeId)) issues.push({ field: at('archetypeId'), messageTh: 'ไม่พบต้นแบบมอนนี้' });
    if (!Number.isInteger(m.level) || !inRange(m.level, L.levelMin, L.levelMax)) {
      issues.push({ field: at('level'), messageTh: `เลเวลต้องเป็นจำนวนเต็ม ${L.levelMin}–${L.levelMax}` });
    }
    if (!inRange(m.hpMult, L.hpMultMin, L.hpMultMax)) {
      issues.push({ field: at('hpMult'), messageTh: `ตัวคูณ HP ต้องอยู่ระหว่าง ${L.hpMultMin}–${L.hpMultMax}` });
    }
    if (!inRange(m.dmgMult, L.dmgMultMin, L.dmgMultMax)) {
      issues.push({ field: at('dmgMult'), messageTh: `ตัวคูณดาเมจต้องอยู่ระหว่าง ${L.dmgMultMin}–${L.dmgMultMax}` });
    }
    const skills = m.skills ?? [];
    const allowed = new Set<string>(CHALLENGE_MONSTER_SKILLS);
    if (skills.length > L.skillsMax) issues.push({ field: at('skills'), messageTh: `เลือกสกิลได้ไม่เกิน ${L.skillsMax} ตัว` });
    else if (new Set(skills).size !== skills.length) issues.push({ field: at('skills'), messageTh: 'เลือกสกิลซ้ำ' });
    else if (skills.some((s) => !allowed.has(s))) {
      issues.push({ field: at('skills'), messageTh: `สกิลของมอนเลือกได้จาก ${CHALLENGE_MONSTER_SKILLS.join(' · ')} เท่านั้น` });
    }
    if (typeof m.programSource === 'string' && m.programSource.trim() !== '' && challengeArchetype(m.archetypeId)) {
      const errors = checkMonsterProgram(m.programSource.replace(/\r\n?/g, '\n'), challengeMonsterSkills({ ...m, skills }));
      for (const e of errors) {
        issues.push({ field: at('programSource'), messageTh: `${e.line}:${e.col}:${e.name}:${e.messageTh}` });
      }
    }
  });
  return issues;
}

/**
 * อาชีพของตัวละครตัวอย่างตอนทดลองสู้ (ข้อ M7) — นักศึกษาที่ยังไม่ผ่านชั้น 1 ยังเป็นมือใหม่ จึงเลือกได้ด้วย
 */
export const CHALLENGE_TRIAL_CLASSES = ['novice', ...PLAYABLE_CLASSES] as const;
export type ChallengeTrialClassId = (typeof CHALLENGE_TRIAL_CLASSES)[number];

/**
 * รางวัลชนะครั้งแรก (ตกลง 7 ต.ค. 2569 — ข้อ M4) คิดจากเลเวลของผู้เล่น ไม่ใช่จากมอนที่อาจารย์ตั้ง
 * ตั้งมอนให้อ่อนจึงไม่ได้รางวัลมากขึ้น · EXP = 10% ของเลเวลถัดไป · ทอง ≈ สามเท่าของมอนหนึ่งตัวเลเวลเดียวกัน
 * เจ้าของโจทย์สู้มอนของตัวเองไม่ได้รางวัล (ข้อ M4 เพิ่มเติม 7 ต.ค. 2569) — ตัดสินที่ backend ตอนบันทึกผล
 */
export function challengeReward(playerLevel: number): { exp: number; gold: number } {
  const level = Math.max(1, Math.floor(playerLevel));
  return {
    exp: Math.max(1, Math.round(FORMULAS.expToNext(level) * 0.1)),
    gold: 15 + 9 * level,
  };
}
