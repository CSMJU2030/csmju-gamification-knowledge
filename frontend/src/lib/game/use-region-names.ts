'use client';

/**
 * ชื่อไทยของภูมิภาค — มาจาก GET /game-data (`regions`) ซึ่งไม่ผูกกับตัวละคร
 * (GET /regions ตอบ 404 ถ้ายังไม่มีตัวละคร เพราะคิดความคืบหน้าด้วย — ผู้สอนที่ไม่เล่นเกมจึงใช้ไม่ได้)
 * โหลดไม่ขึ้นก็แสดง id แทน ไม่ทำให้หน้าพัง
 */
import type { GameData } from '@/lib/api/types';
import { useGame } from './session';

export type RegionName = GameData['regions'][number];

export function useRegionNames(): RegionName[] | null {
  return useGame().gameData?.regions ?? null;
}

export const TOWER_REGION_ID = 'tower';

export function regionName(regionId: string, regions: RegionName[] | null): string {
  return regions?.find((r) => r.id === regionId)?.nameTh ?? regionId;
}

export function placeLabel(regionId: string, floor: number, depth: number, regions: RegionName[] | null): string {
  if (regionId === TOWER_REGION_ID) return `หอคอย ชั้น ${floor}`;
  return `${regionName(regionId, regions)} รอบที่ ${depth}`;
}
