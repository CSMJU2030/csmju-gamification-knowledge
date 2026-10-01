/**
 * ฐานข้อมูลสำหรับ e2e — ล้าง schema แล้วรัน migration ทุกไฟล์ตามลำดับ (เหมือนฐานข้อมูลเปล่าจริง)
 * ใช้ `pg` ตรง ๆ เพื่อให้รันได้แม้เครื่องนั้นดึง schema engine ของ Prisma ไม่ได้
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

export async function resetDatabase(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const dir = join(__dirname, '..', '..', 'prisma', 'migrations');
    const migrations = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const name of migrations) await client.query(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
  } finally {
    await client.end();
  }
}

/** ใส่ไอเทมตรง ๆ (ไม่ผ่านการรบ ซึ่งสุ่มว่าได้ชิ้นไหน) — ใช้กับเทสต์ค้นหาที่ต้องรู้ชื่อไอเทมแน่นอน */
export async function insertItems(
  url: string,
  characterId: string,
  items: ReadonlyArray<{ baseId: string; slot: string; rarity?: string }>,
): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const it of items) {
      await client.query(
        `INSERT INTO items (id, character_id, base_id, slot, rarity, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
        [characterId, it.baseId, it.slot, it.rarity ?? 'common'],
      );
    }
  } finally {
    await client.end();
  }
}

/** อ่านแถวตรง ๆ จากฐานข้อมูล — ใช้ตรวจค่าที่ API ไม่ได้ส่งออก (เช่น person_code) */
export async function queryRows<T extends Record<string, unknown>>(url: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}
