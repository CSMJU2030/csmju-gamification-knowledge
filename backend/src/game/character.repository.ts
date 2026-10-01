/**
 * การเข้าถึงตัวละครที่ทุกโดเมนใช้ร่วมกัน
 *
 * ทุก endpoint ฝั่งผู้เล่นหาตัวละครจาก `core_user_id === token.sub` เท่านั้น — ไม่มี endpoint ไหนรับ id
 * ของตัวละครจาก client นี่คือการตรวจ ownership ชั้น service ตาม authorization.md ข้อ 4
 * (ผู้ใช้คนหนึ่งจึงอ้างถึงตัวละครของคนอื่นไม่ได้เลยโดยโครงสร้าง)
 */
import { notFound } from '../common/api-error';
import type { Character, Item } from '../generated/prisma/client';
import type { PrismaService, Tx } from '../prisma/prisma.service';
import { characterView, type CharacterView } from './character.view';

export type Db = PrismaService | Tx;

export const NO_CHARACTER = 'ยังไม่มีตัวละคร — สร้างตัวละครก่อน (POST /api/v1/characters)';

export async function requireCharacter(db: Db, coreUserId: string): Promise<Character> {
  const row = await db.character.findUnique({ where: { coreUserId } });
  if (!row) throw notFound(NO_CHARACTER);
  return row;
}

/** อุปกรณ์ที่สวมอยู่ เรียงตามลำดับที่ได้มา (seq) — ลำดับมีผลกับผลรวมทศนิยมของโบนัส */
export function equippedItems(db: Db, characterId: string): Promise<Item[]> {
  return db.item.findMany({ where: { characterId, isEquipped: true }, orderBy: { seq: 'asc' } });
}

/**
 * ล็อกแถวตัวละครจนจบทรานแซกชัน แล้วอ่านค่าล่าสุด
 *
 * ทุกการกระทำที่ "อ่านทอง/เลเวล/สเตตัส แล้วเขียนกลับ" ต้องผ่านตรงนี้ ไม่งั้นสองคำขอพร้อมกัน
 * (เช่นรบสองหน้าต่าง) จะอ่านค่าเดียวกันแล้วเขียนทับกัน — เซิร์ฟเวอร์เดิมไม่เจอปัญหานี้เพราะ
 * better-sqlite3 ทำงานแบบ synchronous ทั้งคำขอ แต่ Prisma + Postgres สลับคำขอกันได้
 */
export async function lockCharacter(tx: Tx, characterId: string): Promise<Character> {
  await tx.$queryRaw`SELECT id FROM characters WHERE id = ${characterId}::uuid FOR UPDATE`;
  return tx.character.findUniqueOrThrow({ where: { id: characterId } });
}

export async function loadCharacterView(db: Db, characterId: string): Promise<CharacterView> {
  const row = await db.character.findUniqueOrThrow({ where: { id: characterId } });
  return characterView(row, await equippedItems(db, characterId));
}
