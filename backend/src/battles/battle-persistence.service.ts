/**
 * เขียนผลการรบลงตัวละครในทรานแซกชันเดียว (ย้ายมาจาก persistBattle() ใน server/src/progression.ts)
 *
 * ทางเข้าสู่การรบมีสองทาง (หอคอย · รอบในภูมิภาค) และทั้งสองต้องให้ผลกับตัวละครเหมือนกันทุกประการ
 * จึงมีฟังก์ชันนี้ที่เดียว — exp · เลเวล · สเตตัส · งานสะสม · ทอง · วัสดุ · ของดรอป ·
 * highest_floor (ตัวปลดล็อก) และ region_progress ของโซนนั้น (ตัวเคลียร์) ขยับพร้อมกันเสมอ
 */
import { Injectable } from '@nestjs/common';
import { proficiencyFromBattle, type BaseStats, type BattleResult, type Proficiency } from '@tower/engine';
import { randomUUID } from 'node:crypto';
import { lockCharacter } from '../game/character.repository';
import { enrichInstance, proficiencyOf, statsOf, type EnrichedItem } from '../game/character.view';
import { HERO_ID, progress } from '../game/progression';
import { PrismaService } from '../prisma/prisma.service';

/** "รบที่ไหน รอบที่เท่าไร" — บังคับส่งเสมอ เพราะการรบทุกครั้งเกิดในภูมิภาคใดภูมิภาคหนึ่ง */
export interface BattlePlace {
  regionId: string;
  depth: number;
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

export interface PersistedBattle {
  battleId: string;
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

    const { battleId, before, prog, attempt } = await this.prisma.$transaction(async (tx) => {
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
      return { battleId: battle.id, before: statsOf(row), prog, attempt };
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
}
