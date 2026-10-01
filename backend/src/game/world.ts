/**
 * แผนที่โลก — ทะเบียนภูมิภาค · ความคืบหน้า · ค่าตั้งของระบบดวล (ย้ายมาจาก server/src/world.ts เดิม)
 *
 * กฎเหล็ก (รอบ 2W §2): ภูมิภาคไม่ได้แทนเลขชั้น มันวางทับเลขชั้น
 *   ความยากจริงของการรบหนึ่งรอบ = floorBase + depth - 1
 * นิยามภูมิภาคทั้งหมดมาจาก engine ทางเดียว — ที่นี่ไม่มีสำเนาของตรรกะภูมิภาค
 */
import * as engine from '@tower/engine';
import type { EliteSpawn, RegionDef } from '@tower/engine';

export function allRegions(): RegionDef[] {
  return engine.listRegions();
}

export function regionById(id: string): RegionDef | undefined {
  return engine.getRegion(id);
}

/**
 * หอคอยคือภูมิภาคหนึ่ง แต่มีประตูที่สองที่ไม่ผ่านแผนที่ (`POST /battles` แบบ towerFloor)
 * ทั้งสองประตูต้องใช้ใบคะแนน (region_progress) ใบเดียวกัน
 */
export const TOWER_REGION_ID = 'tower';

export function towerRegion(): RegionDef | undefined {
  return engine.getRegion(TOWER_REGION_ID);
}

export function floorFor(region: RegionDef, depth: number): number {
  return engine.floorForRegion(region.id, depth);
}

export interface RegionProgressView {
  /** เคลียร์ไปถึงรอบที่เท่าไรในโซนนี้ (0 = ยังไม่เคยผ่าน) — จากตารางของโซนนี้เท่านั้น */
  depthCleared: number;
  /** รอบถัดไปของโซนนี้ที่เข้าได้ (0 = ยังเข้าไม่ได้ หรือโซนนี้ไม่มีการรบ) */
  maxDepthAllowed: number;
  completed: boolean;
  unlocked: boolean;
}

/**
 * ความคืบหน้าในภูมิภาคหนึ่ง — แยกสองแหล่งโดยตั้งใจ (รอบ 2F §3.2)
 *   ปลดล็อก (เข้าได้ไหม)  ← highest_floor ตัวเดียวของเกม
 *   เคลียร์ (ผ่านไปกี่รอบ) ← ตาราง region_progress ต่อ (ตัวละคร × ภูมิภาค)
 */
export function regionProgress(region: RegionDef, highestFloor: number, depthCleared: number): RegionProgressView {
  const depths = Math.max(0, region.depths);
  const cleared = Math.max(0, Math.min(depths, Math.floor(depthCleared)));
  const unlocked = highestFloor >= region.floorBase - 1;
  const battle = engine.isBattleRegion(region);
  return {
    depthCleared: cleared,
    maxDepthAllowed: unlocked && battle ? Math.min(depths, cleared + 1) : 0,
    completed: battle && cleared >= depths,
    unlocked,
  };
}

export function rollElite(region: RegionDef, depth: number, seed: number): EliteSpawn | null {
  return engine.rollElite(region.id, depth, seed);
}

/**
 * หอคอยไม่ล็อกเลเวล — มันคือทางพลังของเกม (รอบ 2L §2) ส่วนภูมิภาคอื่นล็อกเมื่อเปิดสวิตช์ใน gamedata
 */
export function isSyncedRegion(region: RegionDef): boolean {
  return engine.gamedata.balance.levelSyncEnabled && region.id !== TOWER_REGION_ID;
}

// ---------------------------------------------------------------- ระบบดวล

export interface DuelConfig {
  /** ขนาดช่วงเลเวลที่จับคู่กันได้ — ช่วงตายตัว (1-5, 6-10, …) จึงสมมาตรเสมอ */
  bandSize: number;
  snapshotsPerPlayer: number;
  snapshotMaxAgeDays: number;
  presenceTtlSec: number;
}

const FALLBACK_DUEL: DuelConfig = {
  bandSize: 5,
  snapshotsPerPlayer: 3,
  snapshotMaxAgeDays: 14,
  presenceTtlSec: 300,
};

export function duelConfig(): DuelConfig {
  const raw = (engine.gamedata as { duel?: Partial<DuelConfig> }).duel;
  const num = (v: unknown, fb: number) => (typeof v === 'number' && v > 0 ? v : fb);
  return {
    bandSize: num(raw?.bandSize, FALLBACK_DUEL.bandSize),
    snapshotsPerPlayer: num(raw?.snapshotsPerPlayer, FALLBACK_DUEL.snapshotsPerPlayer),
    snapshotMaxAgeDays: num(raw?.snapshotMaxAgeDays, FALLBACK_DUEL.snapshotMaxAgeDays),
    presenceTtlSec: num(raw?.presenceTtlSec, FALLBACK_DUEL.presenceTtlSec),
  };
}

export interface LevelBand {
  index: number;
  min: number;
  max: number;
}

export function levelBandFor(level: number): LevelBand {
  const size = Math.max(1, Math.floor(duelConfig().bandSize));
  const index = Math.floor(Math.max(0, level - 1) / size);
  return { index, min: index * size + 1, max: (index + 1) * size };
}
