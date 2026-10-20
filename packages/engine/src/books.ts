/**
 * ตำราสกิล (20 ต.ค. 2569 · docs/design-skill-acquisition.md ระยะ S4 ข้อ 8.4)
 *
 * ตำราหนึ่งเล่ม = กลไกหนึ่งแบบ (พิษ · หลายฮิต · มึน · ดูดเลือด · บัฟ) สกิลที่ได้จริงขึ้นกับอาชีพ (SkillDef.book)
 * ดรอปเมื่อล้มบอส (หอคอยหรือภูมิภาค) หรือมอน EX ที่เป็นต้นทางของเล่มนั้น
 *
 * กติกาข้อ 2 ของการออกแบบ "ดวงไม่เป็นตัวตัดสิน" จึงมีเพดานดวง: ล้มต้นทางของเล่มเดิมครบ `bookPity` ครั้ง
 * โดยยังไม่ได้ = ได้แน่นอน — ดวงตัดสินแค่ว่าได้เร็วหรือช้า ไม่ได้ตัดสินว่าได้หรือไม่ได้
 *
 * การสุ่มใช้สตรีมแยกจากการรบ (คิดจาก seed ของการรบ) และทำหลังจบการรบ จึงไม่แตะผลการรบเดิมเลยแม้แต่ไบต์เดียว
 * (หอคอยมี golden fixture คุมอยู่) · seed เดิม + ข้อมูลเดิม = ผลเดิม
 */
import { gamedata, type SkillBookDef } from './data';
import { hashSeed, mulberry32 } from './rng';
import type { ClassId, CombatEvent, SkillDef } from './types';

export function getBook(id: string): SkillBookDef | undefined {
  return gamedata.skillBooks.find((b) => b.id === id);
}

/** สกิลจากตำราเล่มนี้ของอาชีพนี้ (ผู้ฝึกหัดไม่มี — ได้เมื่อเลือกอาชีพ) */
export function bookSkillFor(classId: ClassId | string, bookId: string): SkillDef | undefined {
  return gamedata.skills.find((s) => s.book === bookId && s.classId === classId);
}

/**
 * ตำราที่มอนตัวนี้เป็นต้นทาง (ไม่มี = undefined) — อ่านจาก id ที่ waves.ts สร้าง
 * `f{floor}w{wave}_boss_{bossId}` · `f{floor}w{wave}_ex_{archetype}` · มอนธรรมดา (`_m{i}_`) ไม่ดรอปตำรา
 */
export function bookSourceOf(monsterId: string): string | undefined {
  const parts = monsterId.split('_');
  if (parts.length < 3) return undefined;
  const rest = parts.slice(2).join('_');
  if (parts[1] === 'boss') return gamedata.skillBooks.find((b) => b.bosses.includes(rest))?.id;
  if (parts[1] === 'ex') return gamedata.skillBooks.find((b) => b.elites.includes(rest))?.id;
  return undefined;
}

export interface BookRoll {
  /** ตำราที่ได้ในการรบนี้ (ตามลำดับที่ล้มต้นทาง) */
  dropped: string[];
  /** ตัวนับเพดานดวงใหม่ (ล้มต้นทางแล้วยังไม่ได้กี่ครั้ง) — เล่มที่ได้แล้วถูกลบออก */
  pity: Record<string, number>;
  /** ล้มต้นทางของเล่มไหนไปกี่ตัวในการรบนี้ (รวมตัวที่ดรอป) */
  kills: Record<string, number>;
}

/**
 * สุ่มตำราจากการรบหนึ่งครั้ง — นับทุกตัวที่ตาย (ฝ่ายศัตรู) ไม่ว่าชนะหรือแพ้ เพราะของที่ฆ่าได้ก็คือฆ่าได้
 * เล่มที่มีแล้ว (หรือเพิ่งได้ในการรบนี้) ไม่สุ่มและไม่นับ
 */
export function rollSkillBooks(opts: {
  events: readonly CombatEvent[];
  heroId: string;
  seed: number;
  owned: readonly string[];
  pity: Readonly<Record<string, number>>;
}): BookRoll {
  const { bookDropChance, bookPity } = gamedata.acquisition;
  const rng = mulberry32(hashSeed(opts.seed, 0xb00c5));
  const pity: Record<string, number> = { ...opts.pity };
  const dropped: string[] = [];
  const kills: Record<string, number> = {};
  for (const e of opts.events) {
    for (const t of e.targets) {
      if (!t.killed || t.id === opts.heroId) continue;
      const book = bookSourceOf(t.id);
      if (!book || opts.owned.includes(book) || dropped.includes(book)) continue;
      kills[book] = (kills[book] ?? 0) + 1;
      const count = (pity[book] ?? 0) + 1;
      // สุ่มทุกครั้งที่นับ (แม้ถึงเพดานแล้ว) ให้จำนวนครั้งที่ใช้สตรีมคงที่ = อธิบายผลย้อนหลังได้ง่าย
      const lucky = rng() < bookDropChance;
      if (lucky || count >= bookPity) {
        dropped.push(book);
        delete pity[book];
      } else {
        pity[book] = count;
      }
    }
  }
  return { dropped, pity, kills };
}
