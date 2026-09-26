/**
 * แผนที่โลก (รอบ 2W) — ภูมิภาคเป็น "ชั้นที่วางทับ" บนเลขชั้น ไม่ใช่ของที่มาแทน
 *
 * กฎเหล็ก §2 ของ docs/design-round2w.md:
 *   ความยากจริงของการรบหนึ่งรอบ = floorBase + depth - 1  แล้วส่งเข้าเครื่องคิดเลขชุดเดิม
 * ที่นี่จึงไม่มีสูตรความยากใหม่แม้แต่บรรทัดเดียว มีแต่การแปลงพิกัด (regionId, depth) → floor
 * และการเลือกว่าจะหยิบมอนตัวไหนมาใส่เวฟ ตัวคูณความยากทั้งหมดยังอยู่ที่ gamedata.balance ชุดเดิม
 */
import type { EliteSpawn, RegionDef, WaveSpec } from './types';
import { gamedata } from './data';
import { hashSeed, mulberry32 } from './rng';
import { buildWavesFor } from './waves';

const regionById = new Map<string, RegionDef>(gamedata.regions.map((r) => [r.id, r]));

/** ทุกจุดบนแผนที่ รวมเมืองที่ไม่มีการรบ (client วาด hotspot จากรายการนี้) */
export function listRegions(): RegionDef[] {
  return gamedata.regions;
}

export function getRegion(regionId: string): RegionDef | undefined {
  return regionById.get(regionId);
}

/**
 * โซนที่กดเข้าไปรบได้ = โซนที่มี depth ให้เข้าอย่างน้อยหนึ่งรอบ
 *
 * เมืองใช้ `depths: 0` เป็นตัวบอกว่า "ที่นี่ไม่มีการรบ" เพราะ `RegionDef` ยังไม่มีช่อง
 * `kind`/`combat` และ types.ts ถูกล็อกไว้ — ดูหมายเหตุที่ส่งให้ PM ในรายงานรอบนี้
 */
export function isBattleRegion(r: RegionDef): boolean {
  return r.depths > 0;
}

export function battleRegions(): RegionDef[] {
  return gamedata.regions.filter(isBattleRegion);
}

/**
 * (regionId, depth) → floor  ตามกฎเหล็ก §2 เป๊ะ ๆ
 * โยนทิ้งเมื่อ depth อยู่นอกช่วง เพราะ "รอบที่ 0" หรือ "รอบที่ 11 ของโซน 10 รอบ"
 * ไม่ใช่ค่าที่ควรถูกเดาให้ — ถ้าปล่อยผ่านจะกลายเป็นการรบที่ความยากไม่ตรงกับที่โชว์บนการ์ด
 */
export function floorForRegion(regionId: string, depth: number): number {
  const region = getRegion(regionId);
  if (!region) throw new Error(`ไม่รู้จักภูมิภาค "${regionId}"`);
  if (!isBattleRegion(region)) {
    throw new Error(`ภูมิภาค "${regionId}" (${region.nameTh}) ไม่มีการรบ`);
  }
  if (!Number.isInteger(depth) || depth < 1 || depth > region.depths) {
    throw new Error(
      `depth ${depth} อยู่นอกช่วงของ "${regionId}" (1..${region.depths})`,
    );
  }
  return region.floorBase + depth - 1;
}

/** ช่วงความยากของโซน — ใช้วาดการ์ดและเช็กว่าโซนทับช่วงกันจริงไหม */
export function regionFloorRange(region: RegionDef): [number, number] {
  return [region.floorBase, region.floorBase + region.depths - 1];
}

/**
 * สุ่มว่ารอบนี้มีมอน EX ไหม — **เรียกตอนกดเข้า ก่อนการรบเริ่ม**
 *
 * กติกา §4 ข้อ 1-2: ผู้เล่นต้องเห็นว่า "รอบนี้มี EX และอยู่เวฟไหน" ก่อนที่การรบจะเริ่ม
 * ไม่ใช่โผล่มากลางทาง — ถ้า EX โผล่กลางทางแล้วแพ้ทั้งที่โค้ดเหมือนเดิม คำสัญญาของเกม
 * ที่ว่า "โค้ดดีขึ้นแล้วผ่าน" เป็นโมฆะทันที
 *
 * สตรีม rng แยกจากของเวฟและของการรบ (tag 0xe11e) เพื่อให้ "มี EX ไหม" ไม่ไปขยับ
 * องค์ประกอบของเวฟที่เหลือ — seed เดิมจึงได้เวฟชุดเดิมทั้งตอนมีและไม่มี EX
 */
export function rollElite(regionId: string, depth: number, seed: number): EliteSpawn | null {
  const region = getRegion(regionId);
  if (!region || !isBattleRegion(region)) return null;
  const chance = region.eliteChance ?? 0;
  if (chance <= 0) return null;

  const floor = floorForRegion(regionId, depth);
  const rng = mulberry32(hashSeed(seed, floor * 6151, depth, 0xe11e));
  if (rng() >= chance) return null;

  const tuning = gamedata.elite;
  const pool = region.pool
    ? gamedata.monsterArchetypes.filter((a) => region.pool!.includes(a.id))
    : gamedata.monsterArchetypes.filter((a) => a.minFloor <= floor);
  if (pool.length === 0) return null;

  const arch = pool[Math.floor(rng() * pool.length)];
  const span = tuning.waveMax - tuning.waveMin + 1;
  const wave = tuning.waveMin + Math.floor(rng() * span);
  return { wave, archetypeId: arch.id, nameTh: `${arch.nameTh}${tuning.nameSuffixTh}` };
}

/** ทุกอย่างที่ผู้เล่นต้องรู้ *ก่อน* กดเริ่มรบ */
export interface RegionEntry {
  regionId: string;
  depth: number;
  /** ความยากจริงที่ส่งเข้าเครื่องคิดเลขชุดเดิม = floorBase + depth - 1 */
  floor: number;
  /** null = รอบนี้ไม่มี EX · ไม่เกินหนึ่งตัวต่อรอบเสมอ */
  elite: EliteSpawn | null;
  lessonTh: string;
  waves: WaveSpec[];
}

/**
 * กดเข้าโซน: คืนทุกอย่างที่ต้องประกาศก่อนรบ (เวฟ + EX + บทเรียนของโซน)
 * deterministic: (regionId, depth, partySize, seed) เดิม = ผลเดิมเสมอ
 */
export function enterRegion(
  regionId: string, depth: number, partySize: number, seed: number,
): RegionEntry {
  const region = getRegion(regionId)!;
  const floor = floorForRegion(regionId, depth); // โยนทิ้งเองถ้าโซน/depth ไม่ถูก
  const elite = rollElite(regionId, depth, seed);
  return {
    regionId,
    depth,
    floor,
    elite,
    lessonTh: region.lessonTh,
    waves: buildRegionWaves(regionId, depth, partySize, seed, elite),
  };
}

/**
 * เวฟของโซนนั้น ๆ — `pool`/`threatRole` ของโซนเป็นตัวกำหนดว่าใครโผล่
 * หอคอยไม่ได้ตั้งทั้งสองค่า ผลจึงเท่ากับ `buildWaves(floor, ...)` เดิมเป๊ะ
 */
export function buildRegionWaves(
  regionId: string, depth: number, partySize: number, seed: number,
  elite: EliteSpawn | null = null,
): WaveSpec[] {
  const region = getRegion(regionId)!;
  const floor = floorForRegion(regionId, depth);
  // กลไกของโซนอาจเริ่มที่รอบหลัง ๆ (minDepth) — รอบก่อนหน้านั้นเหมือนไม่มีกลไก ไม่กิน rng เพิ่ม
  const mechanic = region.mechanic && depth >= (region.mechanic.minDepth ?? 1) ? region.mechanic : undefined;
  return buildWavesFor(floor, partySize, seed, {
    pool: region.pool,
    threatRole: region.threatRole,
    elite,
    mechanic,
  });
}
