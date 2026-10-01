import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { extractToken } from '../guards/core-hub-jwt.guard';

/**
 * Core Hub token ของ request นี้ (ตัวเดียวกับที่ CoreHubJwtGuard ตรวจผ่านแล้ว) — ใช้เรียก API ข้อมูลกลางของ Core Hub
 * ในนามผู้ใช้เท่านั้น (auth-contract.md 1.2 ข้อ 6.1): ห้ามเก็บ ห้าม log ห้ามส่งต่อให้ระบบอื่น
 */
export const AccessToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  extractToken(ctx.switchToHttp().getRequest<Request>()),
);
