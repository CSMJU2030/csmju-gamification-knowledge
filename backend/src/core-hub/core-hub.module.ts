import { Module } from '@nestjs/common';
import { CoreHubClient } from './core-hub.client';

/** ตัวเรียก API ข้อมูลกลางของ Core Hub — ใช้ token ของผู้ใช้ที่ login อยู่เท่านั้น */
@Module({
  providers: [CoreHubClient],
  exports: [CoreHubClient],
})
export class CoreHubModule {}
