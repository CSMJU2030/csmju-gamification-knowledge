/**
 * แปลงแถวในฐานข้อมูลเป็นรูปที่ส่งออก API และรูปที่ engine ใช้ — ย้ายมาจาก server/src/character.ts เดิม
 * ตรรกะเหมือนเดิมทุกบรรทัด ต่างแค่ชื่อคอลัมน์ (Prisma) และ id เป็น UUID
 */
import {
  FORMULAS,
  PASSIVE_POINTS_PER_LEVEL,
  PROFICIENCY_STATS,
  PROFICIENCY_WEIGHTS,
  SKILL_LINES,
  allocatePoints,
  bookSkillFor,
  buildDerivedStats,
  describeRank2,
  gamedata,
  lineProgress,
  lineSkillFor,
  masteryRequirement,
  nextSlotLevel,
  skillRank,
  skillSlotsFor,
  sourceOf,
  type BaseStats,
  type SkillDef,
  type ClassId,
  type DerivedStats,
  type EquipSlot,
  type ItemInstance,
  type Proficiency,
} from '@tower/engine';
import type { Character, Item } from '../generated/prisma/client';
import { baseItemById, bookPityOf, masteryOf, ownedSkills } from './game-rules';

export interface EnrichedItem extends ItemInstance {
  nameTh: string;
  mainStat: { stat: string; value: number };
  equipped: boolean;
}

export function toItemInstance(row: Item): ItemInstance {
  return {
    id: row.id,
    baseId: row.baseId,
    slot: row.slot as EquipSlot,
    rarity: row.rarity as ItemInstance['rarity'],
    upgradeLevel: row.upgradeLevel,
    droppedFloor: row.droppedFloor,
    affixes: row.affixes as unknown as ItemInstance['affixes'],
  };
}

/**
 * เติมชื่อไทยกับ main stat ให้ไอเทมก่อนส่งออก — ต้องเปิดตาราง gamedata จึงเป็นงานของเซิร์ฟเวอร์
 * ใช้กับไอเทมที่เพิ่งดรอป (ยังไม่ใช่แถวใน DB) ด้วย ไม่งั้นการ์ดในหน้าสรุปผลจะขาด main stat
 */
export function enrichInstance(inst: ItemInstance, equipped: boolean): EnrichedItem {
  const base = baseItemById(inst.baseId);
  const nameTh = base ? base.nameTh : inst.baseId;
  const stat = base ? base.stat : 'atk';
  const raw = base ? base.baseValue + base.perFloor * inst.droppedFloor : 0;
  const value = Math.round(raw * (1 + FORMULAS.upgradeBonusPerLevel * inst.upgradeLevel));
  return { ...inst, nameTh, mainStat: { stat, value }, equipped };
}

export function enrichItem(row: Item): EnrichedItem {
  return enrichInstance(toItemInstance(row), row.isEquipped);
}

export function statsOf(row: Character): BaseStats {
  return { str: row.statStr, int: row.statInt, vit: row.statVit, agi: row.statAgi, luk: row.statLuk };
}

/** งานสะสมตั้งแต่เลเวลที่แล้ว (รอบ 2P §3.2) */
export function proficiencyOf(row: Character): Proficiency {
  return { str: row.profStr, int: row.profInt, vit: row.profVit, agi: row.profAgi, luk: row.profLuk };
}

/** แต้มต่อเลเวลที่ความชำนาญเป็นคนแจก (ที่เหลือกันไว้ให้ AGI/LUK ซึ่งโตเอง) */
export const PROFICIENCY_POINTS_PER_LEVEL = FORMULAS.statPointsPerLevel - PASSIVE_POINTS_PER_LEVEL;

const round = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

type ProfStat = (typeof PROFICIENCY_STATS)[number];
type ProfTriple = Record<ProfStat, number>;

/**
 * "เลเวลนี้คุณทำอะไรไปบ้าง" — ส่งเฉพาะ str/int/vit (ห้ามมี agi/luk เพราะผู้เล่นควบคุมไม่ได้)
 * work = งานดิบ · share = สัดส่วนหลังคูณน้ำหนัก (รวม 1.0) · projectedPoints = ถ้าเลเวลอัพตอนนี้ได้เท่าไร
 */
export function proficiencyView(row: Character) {
  const work = proficiencyOf(row);

  const weighted = {} as ProfTriple;
  let total = 0;
  for (const k of PROFICIENCY_STATS) {
    const v = Number.isFinite(work[k]) && work[k] > 0 ? work[k] * PROFICIENCY_WEIGHTS[k] : 0;
    weighted[k] = v;
    total += v;
  }

  const workOut = {} as ProfTriple;
  const share = {} as ProfTriple;
  for (const k of PROFICIENCY_STATS) {
    workOut[k] = round(Math.max(0, work[k]), 3);
    share[k] = total > 0 ? round(weighted[k] / total, 4) : 0;
  }

  const alloc = allocatePoints(work, FORMULAS.statPointsPerLevel, row.classId as ClassId, row.level + 1);
  const projectedPoints = {} as ProfTriple;
  for (const k of PROFICIENCY_STATS) projectedPoints[k] = alloc[k];

  return {
    work: workOut,
    share,
    projectedPoints,
    pointsPerLevel: PROFICIENCY_POINTS_PER_LEVEL,
    usingClassDefault: total <= 0,
  };
}

export function derivedFor(row: Character, equipped: Item[]): DerivedStats {
  return buildDerivedStats(row.classId as ClassId, row.level, statsOf(row), equipped.map(toItemInstance));
}

/** สกิลแบบย่อ (ชื่อ · ชนิด · MP) — ใช้ในส่วนที่บอก "จะได้สกิลอะไร" ก่อนได้จริง */
export function skillBrief(s: SkillDef) {
  return { id: s.id, nameTh: s.nameTh, kind: s.kind, mpCost: s.mpCost, aoe: s.aoe };
}

/**
 * สกิลทั้งหมดของตัวละคร พร้อมที่มา ขั้น และความคืบหน้าสู่ขั้น 2 (docs/design-skill-acquisition.md ข้อ 8)
 * `mastery` มีเฉพาะสกิลที่มีขั้น 2 — count หยุดที่ need
 */
export function skillsView(row: Character) {
  const mastery = masteryOf(row);
  const need = gamedata.acquisition.masteryNeed;
  return ownedSkills(row).map((s) => {
    const requirementTh = masteryRequirement(s.id);
    const count = mastery[s.id] ?? 0;
    return {
      id: s.id,
      nameTh: s.nameTh,
      unlockLevel: s.unlockLevel,
      source: sourceOf(s),
      ...(s.region ? { region: s.region } : {}),
      ...(s.line ? { line: s.line } : {}),
      ...(s.book ? { book: s.book } : {}),
      mpCost: s.mpCost,
      kind: s.kind,
      aoe: s.aoe,
      rank: skillRank(s.id, count),
      ...(requirementTh
        ? { mastery: { count: Math.min(count, need), need, requirementTh, rank2Th: describeRank2(s) ?? '' } }
        : {}),
    };
  });
}

/** ช่องสกิลตามเลเวล (ข้อ 8.2) */
export function skillSlotsView(row: Character) {
  return { slots: skillSlotsFor(row.level), nextLevel: nextSlotLevel(row.level) };
}

/** สกิลสายจากความชำนาญ (ระยะ S3) — แต้มที่ความชำนาญแจกให้แต่ละสายเทียบกับเกณฑ์ */
export function linesView(row: Character) {
  const earned = lineProgress(statsOf(row));
  const threshold = gamedata.acquisition.lineThreshold;
  return SKILL_LINES.map((line) => {
    const skill = lineSkillFor(row.classId, line);
    return {
      line,
      earned: earned[line],
      threshold,
      unlocked: !!skill && earned[line] >= threshold,
      skill: skill ? skillBrief(skill) : null,
    };
  });
}

const bossName = new Map(gamedata.bosses.map((b) => [b.id, b.nameTh]));
const archetypeName = new Map(gamedata.monsterArchetypes.map((a) => [a.id, a.nameTh]));

/** ตำราสกิล (ระยะ S4) — ทุกเล่มในเกม พร้อมต้นทางและเพดานดวงของตัวละครนี้ */
export function booksView(row: Character) {
  const pity = bookPityOf(row);
  const pityMax = gamedata.acquisition.bookPity;
  return gamedata.skillBooks.map((b) => {
    const owned = row.skillBooks.includes(b.id);
    const skill = bookSkillFor(row.classId, b.id);
    return {
      id: b.id,
      nameTh: b.nameTh,
      mechanicTh: b.mechanicTh,
      owned,
      pity: owned ? 0 : Math.min(pity[b.id] ?? 0, pityMax),
      pityMax,
      sourcesTh: [
        ...b.bosses.map((id) => bossName.get(id) ?? id),
        ...b.elites.map((a) => `${archetypeName.get(a) ?? a}${gamedata.elite.nameSuffixTh}`),
      ],
      skill: skill ? skillBrief(skill) : null,
    };
  });
}

/** ตัวละครในรูปที่ส่งออก API — เทียบกับ buildCharacterResponse() ของเซิร์ฟเวอร์เดิม */
export function characterView(row: Character, equippedRows: Item[]) {
  const equipment: Record<EquipSlot, EnrichedItem | null> = {
    weapon: null, armor: null, helmet: null, accessory: null,
  };
  for (const it of equippedRows) {
    const slot = it.slot as EquipSlot;
    if (slot in equipment) equipment[slot] = enrichItem(it);
  }

  return {
    id: row.id,
    displayName: row.displayName,
    classId: row.classId,
    level: row.level,
    exp: row.exp,
    expToNext: FORMULAS.expToNext(row.level),
    proficiency: proficiencyView(row),
    stats: statsOf(row),
    derived: derivedFor(row, equippedRows),
    gold: row.gold,
    materials: row.materials,
    equipment,
    skills: skillsView(row),
    skillSlots: skillSlotsView(row),
    lines: linesView(row),
    books: booksView(row),
    highestFloorCleared: row.highestFloor,
  };
}

export type CharacterView = ReturnType<typeof characterView>;
