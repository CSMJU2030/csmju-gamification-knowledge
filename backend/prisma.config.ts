/**
 * Prisma 7 อ่าน URL ของฐานข้อมูลจากไฟล์นี้ ไม่ใช่จาก schema.prisma
 *
 * `prisma generate` ไม่ต้องต่อฐานข้อมูล และ CI ขั้น typecheck / test / generate:openapi
 * ไม่มี DATABASE_URL — จึงปล่อยให้ว่างได้ คำสั่งที่ต้องต่อจริง (migrate) จะฟ้องเองถ้าไม่ได้ตั้ง
 */
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
