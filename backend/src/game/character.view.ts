/**
 * แปลงแถวในฐานข้อมูลเป็นรูปที่ส่งออก API และรูปที่ engine ใช้ — ย้ายมาจาก server/src/character.ts เดิม
 * ตรรกะเหมือนเดิมทุกบรรทัด ต่างแค่ชื่อคอลัมน์ (Prisma) และ id เป็น UUID
 */
import {
  FORMULAS,
  PASSIVE_POINTS_PER_LEVEL,
  PROFICIENCY_STATS,
  PROFICIENCY_WEIGHTS,
  allocatePoints,
  buildDerivedStats,
  type BaseStats,
  type ClassId,
  type DerivedStats,
  type EquipSlot,
  type ItemInstance,
  type Proficiency,
} from '@tower/engine';
import type { Character, Item } from '../generated/prisma/client';
import { baseItemById, unlockedSkills } from './game-rules';

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

export function skillsView(row: Character) {
  return unlockedSkills(row.classId as ClassId, row.level, row.provedRegions).map((s) => ({
    id: s.id,
    nameTh: s.nameTh,
    unlockLevel: s.unlockLevel,
    ...(s.region ? { region: s.region } : {}),
    mpCost: s.mpCost,
    kind: s.kind,
    aoe: s.aoe,
  }));
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
    highestFloorCleared: row.highestFloor,
  };
}

export type CharacterView = ReturnType<typeof characterView>;
