/**
 * Prisma 7 + driver adapter (PrismaPg) ตาม tech-stack.md ข้อ 1
 *
 * ไม่เรียก $connect() ตอนบูตโดยตั้งใจ: PrismaPg ต่อฐานข้อมูลเมื่อมี query แรก
 * ทำให้ `generate:openapi` (ซึ่งสร้างแอปขึ้นมาเพื่ออ่าน decorator อย่างเดียว) รันได้ใน CI ที่ไม่มีฐานข้อมูล
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import type { AppConfig } from '../config/configuration';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<AppConfig, true>) {
    super({ adapter: new PrismaPg({ connectionString: config.get('databaseUrl', { infer: true }) }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
