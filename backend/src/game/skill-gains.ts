/**
 * สิ่งที่การรบหนึ่งครั้งให้กับสกิลของตัวละคร (docs/design-skill-acquisition.md ข้อ 8) — ฟังก์ชันบริสุทธิ์
 * BattlePersistenceService เรียกในทรานแซกชันที่ล็อกแถวตัวละครแล้ว แล้วเขียน `data` กลับพร้อมผลการรบ
 *
 *   S2  ความเชี่ยวชาญ: ครั้งที่ใช้ถูกจังหวะ (engine masteryFromBattle) สะสมเข้า skill_mastery
 *   S3  สกิลสาย: ได้เองเมื่อสเตตัสหลังเลเวลอัพถึงเกณฑ์ — ไม่มีอะไรต้องเก็บ แค่บอกผู้เล่นว่าได้สกิลใหม่
 *   S4  ตำรา: สุ่มจากต้นทางที่ล้มได้ (engine rollSkillBooks) · เก็บตำราที่ได้และตัวนับเพดานดวง
 *
 * ทั้งหมดอ่านจากบันทึกการรบที่เซิร์ฟเวอร์จำลองเอง และใช้ seed ของการรบ — ผลเดิมเมื่อข้อมูลเดิม
 */
import {
  addMastery, gamedata, getBook, masteryFromBattle, rollSkillBooks, bookSkillFor, sourceOf,
  type BaseStats, type BattleResult,
} from '@tower/engine';
import type { Character } from '../generated/prisma/client';
import { skillBrief } from './character.view';
import { bookPityOf, masteryOf, ownedSkills } from './game-rules';
import { HERO_ID } from './progression';

export interface MasteryGain {
  skillId: string;
  nameTh: string;
  /** การรบนี้: ร่ายกี่ครั้ง · ถูกจังหวะกี่ครั้ง · นับจริงกี่ครั้ง (0 = ถูกจังหวะไม่ถึงเกณฑ์) */
  casts: number;
  correct: number;
  credited: number;
  /** สะสมแล้วรวมการรบนี้ */
  total: number;
  need: number;
  rankedUp: boolean;
}

export interface SkillGains {
  mastery: MasteryGain[];
  /** สกิลที่ได้เพิ่มจากการรบนี้ (เลเวลอัพ · สายถึงเกณฑ์ · ตำราใหม่) — สกิลภูมิภาคบอกใน proof แยกอยู่แล้ว */
  newSkills: (ReturnType<typeof skillBrief> & { source: string })[];
  books: {
    dropped: { id: string; nameTh: string; mechanicTh: string; skill: ReturnType<typeof skillBrief> | null }[];
    /** ตำราที่ล้มต้นทางได้ในการรบนี้แต่ยังไม่ดรอป — ใกล้เพดานดวงแค่ไหนแล้ว */
    progress: { id: string; nameTh: string; kills: number; pity: number; pityMax: number }[];
  };
}

export interface SkillGainsResult {
  gains: SkillGains;
  /** ช่องที่ต้องเขียนกลับ (ไม่มี = ไม่เปลี่ยน) */
  data: { skillMastery?: Record<string, number>; skillBooks?: string[]; bookPity?: Record<string, number> };
}

export function skillGainsOf(
  row: Character,
  result: Pick<BattleResult, 'events' | 'seed'>,
  heroMaxHp: number,
  after: { level: number; stats: BaseStats },
): SkillGainsResult {
  const before = ownedSkills(row);
  const beforeIds = before.map((s) => s.id);
  const need = gamedata.acquisition.masteryNeed;

  // ---- S2 ความเชี่ยวชาญ
  const tallies = masteryFromBattle(result.events, HERO_ID, heroMaxHp);
  const added = addMastery(masteryOf(row), tallies, beforeIds);
  const mastery: MasteryGain[] = Object.entries(tallies)
    .filter(([id]) => beforeIds.includes(id))
    .map(([skillId, t]) => {
      const change = added.changes.find((c) => c.skillId === skillId);
      return {
        skillId,
        nameTh: before.find((s) => s.id === skillId)?.nameTh ?? skillId,
        casts: t.casts,
        correct: t.correct,
        credited: change?.gained ?? 0,
        total: added.mastery[skillId] ?? 0,
        need,
        rankedUp: change?.rankedUp ?? false,
      };
    });

  // ---- S4 ตำรา
  const roll = rollSkillBooks({
    events: result.events, heroId: HERO_ID, seed: result.seed, owned: row.skillBooks, pity: bookPityOf(row),
  });
  const books = [...row.skillBooks, ...roll.dropped];
  const pityMax = gamedata.acquisition.bookPity;

  // ---- สกิลใหม่ (เลเวล · สาย · ตำรา) — เทียบก่อน/หลังด้วยเลเวลและสเตตัสหลังการรบ
  const afterSkills = ownedSkills({ ...row, skillBooks: books }, after.level, after.stats);
  const newSkills = afterSkills
    .filter((s) => !beforeIds.includes(s.id))
    .map((s) => ({ ...skillBrief(s), source: sourceOf(s) }));

  const data: SkillGainsResult['data'] = {};
  if (added.changes.length > 0) data.skillMastery = added.mastery;
  if (roll.dropped.length > 0) data.skillBooks = books;
  if (Object.keys(roll.kills).length > 0) data.bookPity = roll.pity;

  return {
    gains: {
      mastery,
      newSkills,
      books: {
        dropped: roll.dropped.map((id) => {
          const b = getBook(id)!;
          const skill = bookSkillFor(row.classId, id);
          return { id, nameTh: b.nameTh, mechanicTh: b.mechanicTh, skill: skill ? skillBrief(skill) : null };
        }),
        progress: Object.entries(roll.kills)
          .filter(([id]) => !roll.dropped.includes(id))
          .map(([id, kills]) => ({ id, nameTh: getBook(id)?.nameTh ?? id, kills, pity: roll.pity[id] ?? 0, pityMax })),
      },
    },
    data,
  };
}
