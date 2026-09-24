/**
 * รอบในภูมิภาค — สองจังหวะเสมอ: สร้างรอบ (ประกาศ + จองที่) → รบ (`POST /api/v1/battles`)
 * เพราะ EX และคู่ดวลต้องประกาศ **ก่อน** การรบเริ่ม (รอบ 2W §8.1) · ย้ายมาจาก server/src/routes/world.ts
 */
import { Injectable } from '@nestjs/common';
import { isBattleRegion, regionFloorRange, syncLevelForFloor, type RegionDef } from '@tower/engine';
import { badRequest, conflict, forbidden, notFound } from '../common/api-error';
import { Page } from '../common/envelope';
import type { PageQueryDto } from '../common/pagination.dto';
import type { Character, RegionRun } from '../generated/prisma/client';
import { requireCharacter, type Db } from '../game/character.repository';
import {
  allRegions, duelConfig, floorFor, isSyncedRegion, regionById, regionProgress, rollElite,
} from '../game/world';
import { PrismaService } from '../prisma/prisma.service';
import { DuelService, announceOf } from './duel.service';
import { runSeed } from './run-seed';
import type { RegionDto, RegionRunDto } from './world.dto';

@Injectable()
export class RegionRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly duels: DuelService,
  ) {}

  /** กวาดรอบที่หมดอายุตอนอ่าน — คนปิดเบราว์เซอร์กลางคันหายไปเองโดยไม่ต้องมีตัวจับเวลา */
  private sweep(now: number) {
    return this.prisma.regionRun.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });
  }

  async listRegions(coreUserId: string, query: PageQueryDto): Promise<Page<RegionDto>> {
    const row = await requireCharacter(this.prisma, coreUserId);
    const now = Date.now();
    await this.sweep(now);

    const progress = await this.prisma.regionProgress.findMany({ where: { characterId: row.id } });
    const cleared = new Map(progress.map((p) => [p.regionId, p.depthCleared]));
    const counts = await this.prisma.regionRun.groupBy({
      by: ['regionId'],
      where: { expiresAt: { gt: new Date(now) } },
      _count: { _all: true },
    });
    const here = new Map(counts.map((c) => [c.regionId, c._count._all]));

    const regions = allRegions().map((r): RegionDto => {
      const [floorLo, floorHi] = regionFloorRange(r);
      return {
        id: r.id,
        nameTh: r.nameTh,
        floorBase: r.floorBase,
        depths: r.depths,
        floorRange: [floorLo, floorHi],
        lessonTh: r.lessonTh,
        eliteChance: r.eliteChance,
        hotspot: r.hotspot,
        ...regionProgress(r, row.highestFloor, cleared.get(r.id) ?? 0),
        playersHere: here.get(r.id) ?? 0,
      };
    });
    return Page.of(regions.slice(query.skip, query.skip + query.limit), regions.length, query.page, query.limit);
  }

  /** คำประกาศของรอบ — คิดจากแถวล้วน ๆ ตอนสร้างรอบและตอนรบจึงได้ก้อนเดียวกัน */
  async announceFor(db: Db, run: RegionRun, region: RegionDef, character: Character): Promise<RegionRunDto> {
    const side = await this.duels.resolveDuelSide(db, run);
    const floor = floorFor(region, run.depth);
    const realLevel = character.level;
    const syncLevel = syncLevelForFloor(floor);
    return {
      id: run.id,
      regionId: region.id,
      depth: run.depth,
      floor,
      nameTh: region.nameTh,
      lessonTh: region.lessonTh,
      elite: rollElite(region, run.depth, runSeed({ ...run, characterSeq: character.seq })),
      duel: side ? announceOf(side) : null,
      sync: isSyncedRegion(region)
        ? { level: Math.min(realLevel, syncLevel), realLevel, applies: realLevel > syncLevel }
        : null,
      expiresAt: run.expiresAt.toISOString(),
    };
  }

  async enter(coreUserId: string, regionId: string, depth: number): Promise<RegionRunDto> {
    const row = await requireCharacter(this.prisma, coreUserId);

    const region = regionById(regionId);
    if (!region) throw notFound('ไม่พบภูมิภาคนี้');
    if (!isBattleRegion(region)) throw badRequest(`"${region.nameTh}" ไม่มีการรบ`);

    // ตรวจ depth กับความคืบหน้าของโซนนี้เอง · การปลดล็อกยังใช้ highest_floor (รอบ 2F §3.2)
    const cleared = await this.prisma.regionProgress.findUnique({
      where: { characterId_regionId: { characterId: row.id, regionId: region.id } },
    });
    const prog = regionProgress(region, row.highestFloor, cleared?.depthCleared ?? 0);
    if (!prog.unlocked) {
      throw conflict(`ยังเข้า "${region.nameTh}" ไม่ได้ — ต้องผ่านความยาก ${region.floorBase - 1} ก่อน`);
    }
    if (depth > prog.maxDepthAllowed) {
      throw conflict(
        `"${region.nameTh}" มี ${region.depths} รอบ · ผ่านแล้ว ${prog.depthCleared} รอบ ` +
          `— ตอนนี้เข้าได้ถึงรอบที่ ${prog.maxDepthAllowed} เท่านั้น`,
      );
    }

    const now = Date.now();
    // กวาดก่อนหาคู่ ไม่งั้นจะประกาศว่าจะเจอคนที่ปิดเบราว์เซอร์ไปนานแล้ว
    await this.sweep(now);

    const run = await this.prisma.$transaction(async (tx) => {
      // หนึ่งตัวละครอยู่ได้ทีละโซน — เข้าใหม่คือรอบใหม่ (seed ใหม่ · คู่ดวลใหม่ · id ใหม่)
      await tx.regionRun.deleteMany({ where: { characterId: row.id } });
      await tx.regionRun.create({
        data: {
          characterId: row.id,
          regionId: region.id,
          depth,
          enteredAt: new Date(now),
          expiresAt: new Date(now + duelConfig().presenceTtlSec * 1000),
        },
      });
      // ต้องมีแถวก่อน แล้วค่อยหาคู่ — คู่ดวลถูกเลือกตอนนี้แล้วจดลงแถว ไม่ใช่ตอนรบ
      await this.duels.pickDuelPartner(tx, row, region, now);
      return tx.regionRun.findUniqueOrThrow({ where: { characterId: row.id } });
    });

    return this.announceFor(this.prisma, run, region, row);
  }

  /** ออกจากโซน — แถวของรอบถูกลบ (คนอื่นจะไม่เห็นว่าเราอยู่ในโซนอีก) */
  async leave(coreUserId: string, runId: string): Promise<{ id: string; deleted: true }> {
    const row = await requireCharacter(this.prisma, coreUserId);
    const run = await this.prisma.regionRun.findUnique({ where: { id: runId } });
    if (!run) throw notFound('ไม่พบรอบนี้ (อาจหมดอายุหรือเข้ารอบใหม่ไปแล้ว)');
    if (run.characterId !== row.id) throw forbidden('รอบนี้เป็นของผู้เล่นคนอื่น');
    await this.prisma.regionRun.delete({ where: { id: run.id } });
    return { id: run.id, deleted: true };
  }
}
