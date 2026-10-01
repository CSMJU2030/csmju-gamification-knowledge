/**
 * ระบบดวล (รอบ 2W §5 · §8) — ย้ายมาจาก server/src/routes/world.ts เดิม
 *
 * ลำดับการหาคู่ตอนกดเข้าโซน:
 *   1. มีผู้เล่นอื่นอยู่โซนเดียวกันตอนนี้ และอยู่ช่วงเลเวลเดียวกัน → คนนั้น (จับคู่สองทาง)
 *   2. ไม่มี → สแนปช็อตล่าสุดของผู้เล่นคนอื่นในช่วงเลเวลเดียวกัน
 *   3. ไม่มีอีก → รอบนั้นไม่มีคู่ดวล (ไม่ใช่เรื่องผิดปกติ)
 * ผลดวลคำนวณครั้งเดียวต่อคู่ แล้วฝ่ายที่สองอ่านก้อนเดิมกลับไป — ทั้งคู่เห็นบันทึกชุดเดียวกันทุกไบต์
 */
import { Injectable } from '@nestjs/common';
import {
  buildDerivedStats, hashSeed, runDuel,
  type ClassId, type CombatEvent, type Combatant, type RegionDef,
} from '@tower/engine';
import type { Character, DuelSnapshot, RegionRun } from '../generated/prisma/client';
import { equippedItems, type Db } from '../game/character.repository';
import { statsOf, toItemInstance } from '../game/character.view';
import { unlockedSkills } from '../game/game-rules';
import { buildHero } from '../game/progression';
import { duelConfig, levelBandFor } from '../game/world';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { liveId, snapId } from './run-seed';

const DAY_MS = 24 * 60 * 60 * 1000;

export type DuelSide =
  | { kind: 'live'; character: Character; program: string }
  | { kind: 'snapshot'; snap: DuelSnapshot };

export interface DuelAnnounce {
  displayName: string;
  classId: string;
  level: number;
  /** true = อยู่ในโซนตอนนี้จริง · false = สแนปช็อต */
  live: boolean;
}

export interface DuelBlock {
  opponent: DuelAnnounce;
  events: CombatEvent[];
  /** มุมมองของผู้เรียก — ฝั่งที่แพ้ไม่ได้เสียอะไรในรอบนั้นเลย */
  won: boolean;
  byTimeout: boolean;
  rounds: number;
  opponentProgram: string;
}

interface DuelPairing {
  key: string;
  seed: number;
  opponentCharacterId: string;
}

const hasProgram = (source: string | null | undefined): source is string =>
  typeof source === 'string' && source.trim() !== '';

export function announceOf(side: DuelSide): DuelAnnounce {
  if (side.kind === 'snapshot') {
    return { displayName: side.snap.displayName, classId: side.snap.classId, level: side.snap.level, live: false };
  }
  return { displayName: side.character.displayName, classId: side.character.classId, level: side.character.level, live: true };
}

@Injectable()
export class DuelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * แปลงคู่ที่จดไว้ในแถว region_runs กลับเป็นคู่ดวลจริง — คืน null ได้เสมอโดยไม่ถือเป็นความผิดพลาด
   * (สแนปช็อตอาจถูก prune ไปแล้ว หรือคู่ที่ประกาศไว้ไม่มีโปรแกรม)
   */
  async resolveDuelSide(db: Db, run: RegionRun): Promise<DuelSide | null> {
    if (run.duelCharacterId !== null) {
      const character = await db.character.findUnique({ where: { id: run.duelCharacterId } });
      if (!character || !hasProgram(character.programSource)) return null;
      return { kind: 'live', character, program: character.programSource };
    }
    if (run.duelSnapshotId !== null) {
      const snap = await db.duelSnapshot.findUnique({ where: { id: run.duelSnapshotId } });
      return snap ? { kind: 'snapshot', snap } : null;
    }
    return null;
  }

  /** อีกฝ่ายยังอยู่จริงและชี้กลับมาหากันครบสองทางแล้วหรือยัง */
  private async hasLivePartner(tx: Tx, run: RegionRun, now: number): Promise<boolean> {
    if (run.duelCharacterId === null) return false;
    const theirs = await tx.regionRun.findUnique({ where: { characterId: run.duelCharacterId } });
    return !!theirs && theirs.expiresAt.getTime() > now && theirs.duelCharacterId === run.characterId;
  }

  /**
   * เลือกคู่ดวลตอนกดเข้า แล้วจดลงแถว — **จับคู่สองทางเสมอ** ไม่งั้นคนที่เข้าก่อนจะไปดวลสแนปช็อต
   * ส่วนคนที่สองไปดวลคนแรก = สองแมตช์คนละอัน และ "สองคนได้บันทึกชุดเดียวกัน" ไม่มีวันเกิด
   * ไม่แตะคู่ที่จับกันสองทางอยู่แล้ว เพื่อไม่ให้คนที่สามแย่งคู่ของคนอื่นกลางคัน
   */
  async pickDuelPartner(tx: Tx, me: Character, region: RegionDef, now: number): Promise<void> {
    const cfg = duelConfig();
    const band = levelBandFor(me.level);

    const live = await tx.regionRun.findFirst({
      where: {
        regionId: region.id,
        expiresAt: { gt: new Date(now) },
        characterId: { not: me.id },
        character: { level: { gte: band.min, lte: band.max } },
      },
      orderBy: [{ enteredAt: 'desc' }, { character: { seq: 'asc' } }],
      include: { character: true },
    });

    if (live && hasProgram(live.character.programSource)) {
      await tx.regionRun.update({
        where: { characterId: me.id },
        data: { duelCharacterId: live.characterId, duelSnapshotId: null },
      });
      // ล็อกแถวของอีกฝ่ายก่อนตัดสินว่าจะเขียนทับไหม — กันสองคนที่เข้าพร้อมกันแย่งคนเดียวกัน
      await tx.$queryRaw`SELECT id FROM region_runs WHERE character_id = ${live.characterId}::uuid FOR UPDATE`;
      const theirs = await tx.regionRun.findUnique({ where: { characterId: live.characterId } });
      if (theirs && !(await this.hasLivePartner(tx, theirs, now))) {
        await tx.regionRun.update({
          where: { characterId: live.characterId },
          data: { duelCharacterId: me.id, duelSnapshotId: null },
        });
      }
      return;
    }

    const snap = await tx.duelSnapshot.findFirst({
      where: {
        characterId: { not: me.id },
        level: { gte: band.min, lte: band.max },
        createdAt: { gte: new Date(now - cfg.snapshotMaxAgeDays * DAY_MS) },
      },
      orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
    });
    if (snap) {
      await tx.regionRun.update({
        where: { characterId: me.id },
        data: { duelCharacterId: null, duelSnapshotId: snap.id },
      });
    }
  }

  /**
   * กุญแจของแมตช์ + seed ของการดวล — ต้องสมมาตร (§8.4): เรียงคู่ตาม seq ก่อนเสมอ
   * ทั้งสองฝั่งจึงคิดได้ค่าเดียวกันจากแถวของตัวเอง
   */
  private async pairingFor(me: Character, run: RegionRun, side: DuelSide, now: number): Promise<DuelPairing> {
    const entered = run.enteredAt.getTime();
    if (side.kind === 'snapshot') {
      return {
        key: `snap:${side.snap.seq}:${me.seq}:${entered}`,
        seed: hashSeed(side.snap.seq, me.seq, entered, 0x5aa9),
        opponentCharacterId: side.snap.characterId,
      };
    }
    const them = side.character;
    const theirs = await this.prisma.regionRun.findUnique({ where: { characterId: them.id } });
    if (theirs && theirs.expiresAt.getTime() > now && theirs.duelCharacterId === me.id) {
      const mine = { seq: me.seq, entered };
      const other = { seq: them.seq, entered: theirs.enteredAt.getTime() };
      const [lo, hi] = me.seq <= them.seq ? [mine, other] : [other, mine];
      return {
        key: `${lo.seq}:${lo.entered}:${hi.seq}:${hi.entered}`,
        seed: hashSeed(lo.seq, lo.entered, hi.seq, hi.entered),
        opponentCharacterId: them.id,
      };
    }
    // อีกฝ่ายออกไปแล้ว หรือจับคู่กับคนอื่นไปแล้ว — แมตช์นี้มีคนเห็นคนเดียว ใช้กุญแจอีกรูปไม่ให้ชนกัน
    return {
      key: `one:${me.seq}:${entered}:${them.seq}`,
      seed: hashSeed(me.seq, entered, them.seq, 0x0e1e),
      opponentCharacterId: them.id,
    };
  }

  /**
   * คู่ต่อสู้ฝั่งตรงข้ามเลือดเต็ม (การดวลเป็นแมตช์แยก ไม่กินเลือดของรอบนั้น)
   * สแนปช็อต: ใช้ค่าที่เก็บไว้ดิบ ๆ ห้ามคำนวณใหม่ ไม่งั้นมันจะเปลี่ยนตามที่เจ้าของเปลี่ยนของ
   */
  private async opponentCombatant(side: DuelSide): Promise<Combatant> {
    if (side.kind === 'live') {
      const equipped = await equippedItems(this.prisma, side.character.id);
      return buildHero(side.character, equipped, liveId(side.character.seq)).combatant;
    }
    const snap = side.snap;
    return {
      id: snapId(snap.seq),
      name: snap.displayName,
      side: 'party',
      classId: snap.classId as ClassId,
      level: snap.level,
      stats: snap.stats as unknown as Combatant['stats'],
      derived: snap.derived as unknown as Combatant['derived'],
      skills: snap.skills as unknown as string[],
      rules: [],
      ...({ programSource: snap.programSource } as object),
    };
  }

  /** รัน (หรืออ่านคืน) การดวลของรอบนี้ — ทั้งสองทางจบที่การอ่านแถวใน duel_matches เหมือนกัน */
  async runDuelFor(me: Character, run: RegionRun, hero: Combatant, side: DuelSide, now: number): Promise<DuelBlock> {
    const { key, seed, opponentCharacterId } = await this.pairingFor(me, run, side, now);

    if (!(await this.prisma.duelMatch.findUnique({ where: { matchKey: key } }))) {
      const opponent = await this.opponentCombatant(side);
      const r = runDuel(hero, opponent, seed);
      const [a, b] = me.id <= opponentCharacterId ? [me.id, opponentCharacterId] : [opponentCharacterId, me.id];
      await this.prisma.duelMatch.createMany({
        data: [
          {
            matchKey: key,
            aCharacterId: a,
            bCharacterId: b,
            winnerCharacterId: r.winnerId === hero.id ? me.id : opponentCharacterId,
            events: r.events as unknown as object,
            createdAt: new Date(now),
          },
        ],
        skipDuplicates: true,
      });
    }

    const match = await this.prisma.duelMatch.findUniqueOrThrow({ where: { matchKey: key } });
    const events = match.events as unknown as CombatEvent[];
    return {
      opponent: announceOf(side),
      events,
      won: match.winnerCharacterId === me.id,
      // ไม่มีใครถูกฆ่าเลย = ครบรอบแล้วตัดสินด้วยสัดส่วนเลือด
      byTimeout: !events.some((ev) => ev.targets.some((t) => t.killed)),
      rounds: events.length > 0 ? events[events.length - 1].turn : 0,
      opponentProgram: side.kind === 'live' ? side.program : side.snap.programSource,
    };
  }

  /**
   * เก็บภาพนิ่งของผู้เล่นไว้เป็นคู่ดวลให้คนอื่น — ทำหลังรบในภูมิภาคทุกครั้ง
   * ไม่มีโปรแกรม = ไม่เก็บ (คู่ดวลที่ไม่มีโปรแกรมไม่ใช่การดวลที่ §5 ต้องการ)
   */
  async writeSnapshot(characterId: string, now: number): Promise<void> {
    const row = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!row || !hasProgram(row.programSource)) return;

    const cfg = duelConfig();
    const classId = row.classId as ClassId;
    const stats = statsOf(row);
    const equipped = await equippedItems(this.prisma, characterId);
    const derived = buildDerivedStats(classId, row.level, stats, equipped.map(toItemInstance));
    const keep = Math.max(1, Math.floor(cfg.snapshotsPerPlayer));

    await this.prisma.$transaction(async (tx) => {
      await tx.duelSnapshot.create({
        data: {
          characterId,
          displayName: row.displayName,
          classId: row.classId,
          level: row.level,
          stats: stats as unknown as object,
          derived: derived as unknown as object,
          skills: unlockedSkills(classId, row.level).map((s) => s.id),
          programSource: row.programSource,
          createdAt: new Date(now),
        },
      });
      const kept = await tx.duelSnapshot.findMany({
        where: { characterId },
        orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
        take: keep,
        select: { id: true },
      });
      await tx.duelSnapshot.deleteMany({ where: { characterId, id: { notIn: kept.map((k) => k.id) } } });
      await tx.duelSnapshot.deleteMany({ where: { createdAt: { lt: new Date(now - cfg.snapshotMaxAgeDays * DAY_MS) } } });
    });
  }
}
