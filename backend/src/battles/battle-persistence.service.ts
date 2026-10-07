/**
 * เขียนผลการรบลงตัวละครในทรานแซกชันเดียว (ย้ายมาจาก persistBattle() ใน server/src/progression.ts)
 *
 * ทางเข้าสู่การรบมีสองทาง (หอคอย · รอบในภูมิภาค) และทั้งสองต้องให้ผลกับตัวละครเหมือนกันทุกประการ
 * จึงมีฟังก์ชันนี้ที่เดียว — exp · เลเวล · สเตตัส · งานสะสม · ทอง · วัสดุ · ของดรอป ·
 * highest_floor (ตัวปลดล็อก) และ region_progress ของโซนนั้น (ตัวเคลียร์) ขยับพร้อมกันเสมอ
 */
import { Injectable } from '@nestjs/common';
import { challengeReward, proficiencyFromBattle, type BaseStats, type BattleResult, type Proficiency } from '@tower/engine';
import { randomUUID } from 'node:crypto';
import { notFound } from '../common/api-error';
import { lockCharacter } from '../game/character.repository';
import { enrichInstance, proficiencyOf, statsOf, type EnrichedItem } from '../game/character.view';
import { HERO_ID, progress } from '../game/progression';
import { PrismaService } from '../prisma/prisma.service';

/** "รบที่ไหน รอบที่เท่าไร" — บังคับส่งเสมอ เพราะการรบทุกครั้งเกิดในภูมิภาคใดภูมิภาคหนึ่ง */
export interface BattlePlace {
  regionId: string;
  depth: number;
  /** การรบนี้พิสูจน์บทเรียนของภูมิภาคได้ (regionProof ของ engine) — ได้สกิลประจำภูมิภาค */
  proofPassed?: boolean;
}

/**
 * การรบครั้งนี้เป็นครั้งที่เท่าไรที่จุดเดียวกัน (ภูมิภาค + รอบ) — playtest รอบ A ข้อ 6 (26 ก.ย. 2026)
 * หน้าเว็บใช้ตัดสินว่าครั้งแรกต้องดูฉากจนจบ และใช้เทียบผลกับครั้งก่อนเพื่อให้เห็นการเติบโต
 * คิดในทรานแซกชันเดียวกับที่บันทึก (ล็อกแถวตัวละครไว้แล้ว) สองการรบพร้อมกันจึงได้เลขไม่ซ้ำ
 */
export interface BattleAttempt {
  attemptNo: number;
  firstAttempt: boolean;
  previous: { victory: boolean; wavesCleared: number; createdAt: Date } | null;
}

/** ผลบันทึกของการสู้กับมอนของโจทย์ (docs/design-challenge-monsters.md ข้อ M4 · M6) */
export interface PersistedChallengeBattle {
  attemptId: string;
  attempt: BattleAttempt;
  firstClear: boolean;
  reward: { exp: number; gold: number };
  /** เจ้าของโจทย์สู้มอนของตัวเอง — ไม่มีรางวัล (ข้อ M4 เพิ่มเติม) */
  ownChallenge: boolean;
  gains: PersistedBattle['gains'];
}

export interface PersistedBattle {
  battleId: string;
  /** พิสูจน์ภูมิภาคนี้สำเร็จเป็นครั้งแรกในการรบนี้ */
  newlyProved: boolean;
  attempt: BattleAttempt;
  result: BattleResult & { drops: { gold: number; materials: number; items: EnrichedItem[] } };
  gains: {
    leveledUp: boolean;
    newLevel?: number;
    statsGained?: BaseStats;
  };
}

@Injectable()
export class BattlePersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async persist(
    characterId: string,
    result: BattleResult,
    heroMaxHp: number,
    floor: number,
    place: BattlePlace,
  ): Promise<PersistedBattle> {
    // id ของไอเทมจาก engine คิดจาก seed จึงซ้ำข้ามการรบได้ — แทนด้วย UUID ก่อนเก็บ
    for (const item of result.drops.items) item.id = randomUUID();

    const { battleId, before, prog, attempt, newlyProved } = await this.prisma.$transaction(async (tx) => {
      // ล็อกแถวแล้วคิดผลจากค่าล่าสุด — สองการรบที่จบพร้อมกันต้องไม่เขียนทับกัน
      const row = await lockCharacter(tx, characterId);

      // งานของการรบนี้ + ที่สะสมไว้ตั้งแต่เลเวลที่แล้ว (รอบ 2P §3.2)
      const battleWork = proficiencyFromBattle(result, HERO_ID, heroMaxHp);
      const carried = proficiencyOf(row);
      const work: Proficiency = {
        str: carried.str + battleWork.str,
        int: carried.int + battleWork.int,
        vit: carried.vit + battleWork.vit,
        agi: carried.agi + battleWork.agi,
        luk: carried.luk + battleWork.luk,
      };
      const prog = progress(row, work, result.expGained);
      const highestFloor = result.victory && floor > row.highestFloor ? floor : row.highestFloor;
      // ผลพิสูจน์เขียนพร้อมผลการรบ บนแถวที่ล็อกไว้ — สองการรบพร้อมกันได้สกิลครั้งเดียว ไม่ซ้ำในอาเรย์
      const newlyProved = !!place.proofPassed && !row.provedRegions.includes(place.regionId);

      // สร้างทีละชิ้นตามลำดับที่ดรอป เพื่อให้ seq (ลำดับในกระเป๋า) ตรงกับลำดับในบันทึกการรบ
      for (const item of result.drops.items) {
        await tx.item.create({
          data: {
            id: item.id,
            characterId,
            baseId: item.baseId,
            slot: item.slot,
            rarity: item.rarity,
            upgradeLevel: item.upgradeLevel,
            droppedFloor: item.droppedFloor,
            affixes: item.affixes as unknown as object,
          },
        });
      }

      await tx.character.update({
        where: { id: characterId },
        data: {
          exp: prog.exp,
          level: prog.level,
          gold: row.gold + result.drops.gold,
          materials: row.materials + result.drops.materials,
          highestFloor,
          statStr: prog.stats.str,
          statInt: prog.stats.int,
          statVit: prog.stats.vit,
          statAgi: prog.stats.agi,
          statLuk: prog.stats.luk,
          profStr: prog.carry.str,
          profInt: prog.carry.int,
          profVit: prog.carry.vit,
          profAgi: prog.carry.agi,
          profLuk: prog.carry.luk,
          ...(newlyProved ? { provedRegions: [...row.provedRegions, place.regionId] } : {}),
        },
      });

      // ความคืบหน้าของโซนขยับเมื่อ "ชนะ" เท่านั้น และไม่ถอยหลัง (เล่นรอบเก่าซ้ำต้องไม่ลบรอบที่ไกลกว่า)
      if (result.victory && place.depth >= 1) {
        const key = { characterId_regionId: { characterId, regionId: place.regionId } };
        const existing = await tx.regionProgress.findUnique({ where: key });
        if (!existing) {
          await tx.regionProgress.create({
            data: { characterId, regionId: place.regionId, depthCleared: place.depth },
          });
        } else if (place.depth > existing.depthCleared) {
          await tx.regionProgress.update({ where: key, data: { depthCleared: place.depth } });
        } else {
          await tx.regionProgress.update({ where: key, data: { updatedAt: new Date() } });
        }
      }

      const samePlace = { characterId, regionId: place.regionId, depth: place.depth };
      // ทรานแซกชันแบบ interactive ใช้การเชื่อมต่อเดียว — ถามทีละคำสั่ง
      const priorCount = await tx.battle.count({ where: samePlace });
      const last = await tx.battle.findFirst({ where: samePlace, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      const attempt: BattleAttempt = {
        attemptNo: priorCount + 1,
        firstAttempt: priorCount === 0,
        previous: last ? { victory: last.isVictory, wavesCleared: last.wavesCleared, createdAt: last.createdAt } : null,
      };

      const battle = await tx.battle.create({
        data: {
          characterId,
          regionId: place.regionId,
          depth: place.depth,
          floor,
          isVictory: result.victory,
          wavesCleared: result.wavesCleared,
          expGained: result.expGained,
          goldGained: result.drops.gold,
        },
      });
      return { battleId: battle.id, before: statsOf(row), prog, attempt, newlyProved };
    });

    // สเตตัสที่เพิ่งได้ — ผู้เล่นไม่ได้กดแจกแต้มเอง ถ้าไม่บอกว่า "ได้ +3 STR เพราะตีเยอะ" จะกลายเป็นเวทมนตร์
    const statsGained: BaseStats = {
      str: prog.stats.str - before.str,
      int: prog.stats.int - before.int,
      vit: prog.stats.vit - before.vit,
      agi: prog.stats.agi - before.agi,
      luk: prog.stats.luk - before.luk,
    };
    const gainedAny = Object.values(statsGained).some((v) => v !== 0);

    return {
      battleId,
      newlyProved,
      attempt,
      result: {
        ...result,
        drops: { ...result.drops, items: result.drops.items.map((it) => enrichInstance(it, false)) },
      },
      gains: {
        leveledUp: prog.leveledUp,
        ...(prog.leveledUp ? { newLevel: prog.level } : {}),
        ...(gainedAny ? { statsGained } : {}),
      },
    };
  }

  /**
   * บันทึกการสู้กับมอนของโจทย์ — ไม่ใช่การรบปกติ จึงไม่ใช้ persist() ด้านบน:
   * ไม่มีของดรอป · ไม่เพิ่มงานสะสมของสเตตัส · ไม่แตะความคืบหน้าหอคอย/ภูมิภาค · ไม่ลงตาราง battles (ข้อ M6)
   * รางวัลชนะครั้งแรกคิดจากเลเวลผู้เล่น (ข้อ M4) — ตรวจ "เคยชนะไหม" ในทรานแซกชันที่ล็อกแถวตัวละครแล้ว
   * สองคำขอที่ชนะพร้อมกันจึงได้รางวัลครั้งเดียว
   * เจ้าของโจทย์สู้มอนของตัวเองได้ แต่ไม่ได้รางวัล (ข้อ M4 เพิ่มเติม 7 ต.ค. 2569) — กันตั้งโจทย์มอนอ่อนแล้วเก็บรางวัลเอง
   * ตัดสินจากเจ้าของโจทย์ ณ ตอนบันทึก (อ่านในทรานแซกชันเดียวกับที่ล็อกโจทย์)
   */
  async persistChallenge(characterId: string, challengeId: string, result: BattleResult): Promise<PersistedChallengeBattle> {
    const rounds = result.events.length > 0 ? result.events[result.events.length - 1].turn : 0;
    const out = await this.prisma.$transaction(async (tx) => {
      const row = await lockCharacter(tx, characterId);
      // โจทย์ถูกลบระหว่างจำลองการรบ → 404 ไม่ใช่ 500 จาก foreign key · FOR KEY SHARE กันไม่ให้ถูกลบจนบันทึกผลเสร็จ
      const live = await tx.$queryRaw<{ core_user_id: string }[]>`
        SELECT core_user_id FROM challenges WHERE id = ${challengeId}::uuid FOR KEY SHARE`;
      if (live.length === 0) throw notFound('ไม่พบโจทย์นี้ — อาจถูกลบระหว่างสู้');
      const ownChallenge = live[0].core_user_id === row.coreUserId;
      const where = { characterId, challengeId };
      const wonBefore = (await tx.challengeAttempt.count({ where: { ...where, isVictory: true } })) > 0;
      const firstClear = result.victory && !wonBefore && !ownChallenge;
      const reward = firstClear ? challengeReward(row.level) : { exp: 0, gold: 0 };

      const priorCount = await tx.challengeAttempt.count({ where });
      const last = await tx.challengeAttempt.findFirst({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      const attempt: BattleAttempt = {
        attemptNo: priorCount + 1,
        firstAttempt: priorCount === 0,
        // บันทึกของโจทย์เป็นเวฟเดียว: ชนะ = เคลียร์ 1 เวฟ
        previous: last ? { victory: last.isVictory, wavesCleared: last.isVictory ? 1 : 0, createdAt: last.createdAt } : null,
      };

      // งานสะสมไม่เพิ่ม (ส่งของเดิม) — EXP ที่ได้อาจทำให้เลเวลอัพ ซึ่งแจกแต้มจากงานที่สะสมไว้ตามปกติ
      const prog = progress(row, proficiencyOf(row), reward.exp);
      if (firstClear) {
        await tx.character.update({
          where: { id: characterId },
          data: {
            exp: prog.exp,
            level: prog.level,
            gold: row.gold + reward.gold,
            statStr: prog.stats.str,
            statInt: prog.stats.int,
            statVit: prog.stats.vit,
            statAgi: prog.stats.agi,
            statLuk: prog.stats.luk,
            profStr: prog.carry.str,
            profInt: prog.carry.int,
            profVit: prog.carry.vit,
            profAgi: prog.carry.agi,
            profLuk: prog.carry.luk,
          },
        });
      }
      const saved = await tx.challengeAttempt.create({
        data: { ...where, isVictory: result.victory, rounds, expGained: reward.exp, goldGained: reward.gold },
      });
      return { attemptId: saved.id, attempt, firstClear, reward, ownChallenge, before: statsOf(row), prog };
    });

    const statsGained: BaseStats = {
      str: out.prog.stats.str - out.before.str,
      int: out.prog.stats.int - out.before.int,
      vit: out.prog.stats.vit - out.before.vit,
      agi: out.prog.stats.agi - out.before.agi,
      luk: out.prog.stats.luk - out.before.luk,
    };
    const leveledUp = out.firstClear && out.prog.leveledUp;
    return {
      attemptId: out.attemptId,
      attempt: out.attempt,
      firstClear: out.firstClear,
      reward: out.reward,
      ownChallenge: out.ownChallenge,
      gains: {
        leveledUp,
        ...(leveledUp ? { newLevel: out.prog.level, statsGained } : {}),
      },
    };
  }
}
