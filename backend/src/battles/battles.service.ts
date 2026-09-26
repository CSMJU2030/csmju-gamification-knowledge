/**
 * การรบ — ทางเข้าสองทาง ผลลงตัวละครทางเดียว (BattlePersistenceService)
 *   towerFloor   ท้าทายหอคอยชั้นนั้น (แทน POST /tower/challenge เดิม)
 *   regionRunId  รบรอบที่เข้าไว้ในภูมิภาค (แทน POST /world/:id/fight เดิม)
 */
import { Injectable } from '@nestjs/common';
import {
  enterRegion, hashSeed, mulberry32, runBattle, simulateWaves,
} from '@tower/engine';
import { conflict, forbidden, notFound, validationError } from '../common/api-error';
import { Page } from '../common/envelope';
import type { SearchPageQueryDto } from '../common/pagination.dto';
import { idsMatching } from '../common/search';
import type { Character } from '../generated/prisma/client';
import { equippedItems, loadCharacterView, requireCharacter } from '../game/character.repository';
import { TOWER_MAX_FLOOR } from '../game/game-rules';
import { buildHero } from '../game/progression';
import { TOWER_REGION_ID, allRegions, isSyncedRegion, regionById, towerRegion } from '../game/world';
import { PrismaService } from '../prisma/prisma.service';
import { DuelService, type DuelBlock } from '../world/duel.service';
import { RegionRunsService } from '../world/region-runs.service';
import { PARTY_SIZE, liveId, runSeed } from '../world/run-seed';
import type { BattleSummaryDto, TowerProgressDto } from './battle.dto';
import { BattlePersistenceService, type BattleAttempt } from './battle-persistence.service';

/** รูปที่ส่งออกทาง API (วันที่เป็น ISO string ตามมาตรฐาน) */
function attemptView(a: BattleAttempt) {
  return {
    attemptNo: a.attemptNo,
    firstAttempt: a.firstAttempt,
    previous: a.previous ? { ...a.previous, createdAt: a.previous.createdAt.toISOString() } : null,
  };
}

@Injectable()
export class BattlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly persistence: BattlePersistenceService,
    private readonly runs: RegionRunsService,
    private readonly duels: DuelService,
  ) {}

  // ---------------------------------------------------------------- หอคอย

  private async towerDepthCleared(characterId: string): Promise<number> {
    const row = await this.prisma.regionProgress.findUnique({
      where: { characterId_regionId: { characterId, regionId: TOWER_REGION_ID } },
    });
    return row?.depthCleared ?? 0;
  }

  /**
   * เพดานของการท้าทาย = ชั้นถัดไปของใบคะแนนหอคอยเอง (ไม่ใช่ highest_floor + 1)
   * ไม่งั้นชนะที่ภูเขาไฟแล้วมากระโดดข้ามชั้นหอคอยได้ = ฟอกความคืบหน้าข้ามโซน
   */
  private async maxChallengeFloor(row: Character): Promise<number> {
    const tower = towerRegion();
    if (!tower || tower.depths <= 0) return Math.min(row.highestFloor + 1, TOWER_MAX_FLOOR);
    const nextDepth = Math.min(tower.depths, (await this.towerDepthCleared(row.id)) + 1);
    return Math.min(tower.floorBase + nextDepth - 1, TOWER_MAX_FLOOR);
  }

  async towerProgress(coreUserId: string): Promise<TowerProgressDto> {
    const row = await requireCharacter(this.prisma, coreUserId);
    const tower = towerRegion();
    const cleared = await this.towerDepthCleared(row.id);
    const clearedFloor = tower && tower.depths > 0 ? (cleared > 0 ? tower.floorBase + cleared - 1 : 0) : row.highestFloor;
    return { highestFloorCleared: clearedFloor, maxFloor: TOWER_MAX_FLOOR, globalHighestFloor: row.highestFloor };
  }

  private async towerBattle(row: Character, floor: number) {
    const maxAllowed = await this.maxChallengeFloor(row);
    if (floor > maxAllowed) throw conflict(`ท้าทายได้เฉพาะชั้น 1 ถึง ${maxAllowed} เท่านั้น`);
    // หอคอย floorBase 1 → depth กับ floor เลขเดียวกัน แต่คำนวณจากนิยามเสมอ
    const tower = towerRegion();
    const depth = tower ? floor - tower.floorBase + 1 : floor;

    const seed = Math.floor(Math.random() * 0x100000000);
    const hero = buildHero(row, await equippedItems(this.prisma, row.id));
    const result = runBattle([hero.combatant], floor, seed);

    const persisted = await this.persistence.persist(row.id, result, hero.derived.maxHp, floor, {
      regionId: TOWER_REGION_ID,
      depth,
    });
    return {
      id: persisted.battleId,
      result: persisted.result,
      character: await loadCharacterView(this.prisma, row.id),
      ...persisted.gains,
      attempt: attemptView(persisted.attempt),
    };
  }

  // ---------------------------------------------------------------- ภูมิภาค

  private async regionBattle(row: Character, runId: string) {
    const run = await this.prisma.regionRun.findUnique({ where: { id: runId } });
    if (!run) throw notFound('ไม่พบรอบนี้ (อาจหมดอายุหรือเข้ารอบใหม่ไปแล้ว)');
    if (run.characterId !== row.id) throw forbidden('รอบนี้เป็นของผู้เล่นคนอื่น');
    const region = regionById(run.regionId);
    if (!region) throw notFound('ไม่พบภูมิภาคนี้');

    const now = Date.now();
    if (run.expiresAt.getTime() <= now) throw conflict('ต้องกดเข้าโซนก่อน');
    // หนึ่งรอบสู้ได้ครั้งเดียว — จองสิทธิ์ก่อนลงมือ เงื่อนไขอยู่ใน SQL กันสองคำขอพร้อมกัน
    const claimed = await this.prisma.regionRun.updateMany({
      where: { id: run.id, foughtAt: null },
      data: { foughtAt: new Date(now) },
    });
    if (claimed.count === 0) throw conflict('รอบนี้สู้ไปแล้ว — กดเข้าโซนใหม่เพื่อเริ่มรอบใหม่');

    // คำประกาศคิดจากแถวก่อนลงมือ — ก้อนเดียวกับที่ตอนสร้างรอบคืนไปเป๊ะ
    const announce = await this.runs.announceFor(this.prisma, run, region, row);
    const seed = runSeed({ ...run, characterSeq: row.seq });

    const entry = enterRegion(region.id, run.depth, PARTY_SIZE, seed);
    const equipped = await equippedItems(this.prisma, row.id);
    // ล็อกเลเวล (รอบ 2L) ใช้ทั้งกับการรบและการคิดรางวัล · maxHp ใช้ค่าที่ล็อกแล้ว
    const hero = buildHero(row, equipped, undefined, isSyncedRegion(region) ? { floor: entry.floor } : null);
    // สตรีมสุ่มต้องเป็นสูตรเดียวกับ runBattle เป๊ะ — เรียก mulberry32/hashSeed ของ engine ตรง ๆ
    const rng = mulberry32(hashSeed(seed, entry.floor * 977, PARTY_SIZE, 0xba771e));
    const result = simulateWaves([hero.combatant], entry.waves, { floor: entry.floor, seed, rng });

    // ดวลก่อนบันทึกผลรอบ — คู่ดวลต้องเป็นตัวละครที่ประกาศไว้ ไม่ใช่ตัวที่เพิ่งเลเวลอัพ
    let duel: DuelBlock | null = null;
    const side = await this.duels.resolveDuelSide(this.prisma, run);
    if (side) {
      const duelHero = buildHero(row, equipped, liveId(row.seq)).combatant;
      duel = await this.duels.runDuelFor(row, run, duelHero, side, now);
    }

    const persisted = await this.persistence.persist(row.id, result, hero.derived.maxHp, announce.floor, {
      regionId: region.id,
      depth: run.depth,
    });
    await this.duels.writeSnapshot(row.id, now);

    return {
      id: persisted.battleId,
      result: persisted.result,
      announce,
      duel,
      character: await loadCharacterView(this.prisma, row.id),
      ...persisted.gains,
      attempt: attemptView(persisted.attempt),
    };
  }

  // ---------------------------------------------------------------- สาธารณะ

  async create(coreUserId: string, body: { towerFloor?: number; regionRunId?: string }) {
    const hasTower = body.towerFloor !== undefined;
    const hasRun = body.regionRunId !== undefined;
    if (hasTower === hasRun) {
      throw validationError(['ต้องส่ง towerFloor หรือ regionRunId อย่างใดอย่างหนึ่งเท่านั้น']);
    }
    const row = await requireCharacter(this.prisma, coreUserId);
    return hasTower ? this.towerBattle(row, body.towerFloor!) : this.regionBattle(row, body.regionRunId!);
  }

  /** q ค้นในชื่อสถานที่ (หอคอย · ชื่อภูมิภาค จาก gamedata — แปลงเป็นรายการ regionId ก่อนถาม DB) */
  async list(coreUserId: string, query: SearchPageQueryDto): Promise<Page<BattleSummaryDto>> {
    const row = await requireCharacter(this.prisma, coreUserId);
    const regionIds = query.q ? idsMatching(allRegions(), query.q, (r) => r.id, (r) => r.nameTh) : undefined;
    if (regionIds?.length === 0) return Page.of([], 0, query.page, query.limit);
    const where = { characterId: row.id, ...(regionIds ? { regionId: { in: regionIds } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.battle.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.battle.count({ where }),
    ]);
    return Page.of(
      rows.map((b) => ({
        id: b.id,
        regionId: b.regionId,
        depth: b.depth,
        floor: b.floor,
        victory: b.isVictory,
        wavesCleared: b.wavesCleared,
        expGained: b.expGained,
        goldGained: b.goldGained,
        createdAt: b.createdAt.toISOString(),
      })),
      total,
      query.page,
      query.limit,
    );
  }
}
