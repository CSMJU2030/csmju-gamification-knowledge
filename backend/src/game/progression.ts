/**
 * ผลของการรบต่อ "เลเวล · สเตตัส · งานสะสม" และการสร้างตัวละครผู้เล่นในรูปที่ engine ใช้
 * (ย้ายส่วนที่เป็นฟังก์ชันบริสุทธิ์มาจาก server/src/progression.ts เดิม — ส่วนที่เขียนฐานข้อมูลอยู่ที่
 * battles/battle-persistence.service.ts)
 */
import {
  FORMULAS,
  ZERO_PROFICIENCY,
  allocatePoints,
  buildDerivedStats,
  syncLoadout,
  type BaseStats,
  type ClassId,
  type Combatant,
  type DerivedStats,
  type Proficiency,
  type SyncedLoadout,
} from '@tower/engine';
import type { Character, Item } from '../generated/prisma/client';
import { statsOf, toItemInstance } from './character.view';
import { unlockedSkills } from './game-rules';

/** id ของตัวละครผู้เล่นในปาร์ตี้ — ใช้ทั้งตอนสร้าง Combatant และตอนอ่านงานที่เขาทำ */
export const HERO_ID = 'p1';

const addStats = (a: BaseStats, b: BaseStats): BaseStats => ({
  str: a.str + b.str,
  int: a.int + b.int,
  vit: a.vit + b.vit,
  agi: a.agi + b.agi,
  luk: a.luk + b.luk,
});

export interface Progression {
  level: number;
  exp: number;
  stats: BaseStats;
  /** งานสะสมที่จะเขียนกลับ — เป็นศูนย์ทุกช่องถ้าเลเวลอัพรอบนี้ */
  carry: Proficiency;
  leveledUp: boolean;
}

/**
 * แจกแต้มตามงานที่ทำ (รอบ 2P §3.2) — ขึ้นหลายเลเวลในการรบเดียวแจกทีละเลเวล
 * เลเวลอัพแล้วรีเซ็ตตัวสะสม เพราะนับเฉพาะงานตั้งแต่เลเวลที่แล้ว
 *
 * (ระบบ "แต้มค้างจากการกดแจกเอง" ของเซฟรุ่นเก่าไม่ได้ย้ายมา — ฐานข้อมูลนี้เริ่มใหม่
 *  ไม่มีตัวละครไหนมีแต้มค้าง)
 */
export function progress(row: Character, work: Proficiency, gainedExp: number): Progression {
  const classId = row.classId as ClassId;
  let level = row.level;
  let exp = row.exp + gainedExp;
  let stats = statsOf(row);

  let leveledUp = false;
  while (exp >= FORMULAS.expToNext(level)) {
    exp -= FORMULAS.expToNext(level);
    level += 1;
    leveledUp = true;
    stats = addStats(stats, allocatePoints(work, FORMULAS.statPointsPerLevel, classId, level));
  }

  const carry: Proficiency = leveledUp ? { ...ZERO_PROFICIENCY } : work;
  return { level, exp, stats, carry, leveledUp };
}

/** ล็อกเลเวลของภูมิภาค (รอบ 2L) — null = ไม่ล็อก (หอคอย · การดวล) */
export interface HeroSync {
  floor: number;
}

/**
 * ตัวละครผู้เล่นในรูปที่ engine ใช้รบ — ทุกทางเข้าสร้างเหมือนกันเป๊ะ
 * คืน derived ด้วยเพราะผู้เรียกใช้ maxHp เป็นตัวหารของงาน VIT หลังจบการรบ
 *
 * `equippedRows` ต้องเรียงตามลำดับที่ได้ของมา (seq) เสมอ — ผลรวมโบนัสของอุปกรณ์เป็นทศนิยม
 * ลำดับการบวกที่ต่างกันให้ค่าต่างกันในหลักท้าย ๆ ได้
 */
export function buildHero(
  row: Character,
  equippedRows: Item[],
  id: string = HERO_ID,
  sync: HeroSync | null = null,
): { combatant: Combatant; derived: DerivedStats; synced: SyncedLoadout | null } {
  const classId = row.classId as ClassId;
  const real = equippedRows.map(toItemInstance);
  const synced = sync ? syncLoadout(classId, row.level, statsOf(row), real, sync.floor) : null;
  const level = synced ? synced.level : row.level;
  const stats = synced ? synced.stats : statsOf(row);
  const equipment = synced ? synced.equipment : real;
  const derived = buildDerivedStats(classId, level, stats, equipment);
  const combatant: Combatant = {
    id,
    name: row.displayName,
    side: 'party',
    classId,
    level,
    stats,
    derived,
    // สกิลภูมิภาคได้จากการพิสูจน์ ไม่ได้ตามเลเวล จึงมีเท่าเดิมแม้ล็อกเลเวล
    skills: unlockedSkills(classId, level, row.provedRegions).map((s) => s.id),
    // โปรแกรมที่บันทึกได้ผ่าน parse มาแล้วเสมอ rules จึงไม่ถูกใช้ — ส่งว่างไว้ตาม type ของ engine
    rules: [],
    // field ที่ engine อ่านเพิ่มโดยไม่แก้ type Combatant ที่ล็อกไว้: equipment (affix) · programSource
    ...({
      equipment,
      ...(row.programSource.trim() !== '' ? { programSource: row.programSource } : {}),
    } as object),
  };
  return { combatant, derived, synced };
}
