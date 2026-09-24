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
