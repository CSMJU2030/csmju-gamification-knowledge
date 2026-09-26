/**
 * DELETE /api/v1/sessions/current — จบ session ของระบบนี้ (ลบคุกกี้ `core_hub_access_token`)
 *
 * ไม่ใช่ระบบ login/logout ของตัวเอง (auth-contract ข้อ 9): ไม่ออก token · ไม่ตรวจรหัสผ่าน · ไม่แตะ session ของ Core Hub
 * แค่ทิ้งสำเนา Core Hub token ที่ `/auth/callback` เก็บไว้ในคุกกี้ — ปุ่ม "ออกจากระบบ" เรียกตัวนี้
 * แล้วพาไปหน้าแรกของ Core Hub (frontend/src/csmju/sso.ts) · session ของ Core Hub เป็นเรื่องของ Core Hub
 *
 * ทำไมต้องลบเอง: สัญญา 1.0 ไม่มี SSO logout — ถ้าไม่ลบ คุกกี้ของเรายังใช้ได้อีก ≤ 15 นาทีแม้ออกจาก Core Hub แล้ว
 *
 * public: คุกกี้ที่หมดอายุหรือเสียก็ต้องลบได้ · เรียกซ้ำได้ · ข้ามโดเมนเรียกไม่ได้ (DELETE ต้องผ่าน CORS preflight ซึ่งไม่ได้เปิด)
 */
import { Controller, Delete, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiSuccess } from '../common/swagger';
import type { AppConfig } from '../config/configuration';
import { Public } from './decorators/public.decorator';
import { SESSION_COOKIE } from './guards/core-hub-jwt.guard';

export class EndedSessionDto {
  @ApiProperty({ enum: [true], description: 'ลบคุกกี้ session ของระบบนี้แล้ว (ตอบ true เสมอ แม้ไม่มีคุกกี้อยู่ก่อน)' })
  ended!: boolean;
}

@ApiTags('auth')
@Controller('v1/sessions')
export class SessionController {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  @Public()
  @Delete('current')
  @ApiOperation({
    summary: 'จบ session ของระบบนี้ — ลบคุกกี้ core_hub_access_token (ไม่แตะ session ของ Core Hub)',
    security: [],
  })
  @ApiSuccess(EndedSessionDto)
  endCurrent(@Res({ passthrough: true }) res: Response): EndedSessionDto {
    // attribute ต้องตรงกับตอนตั้งใน SsoCallbackController ไม่งั้นเบราว์เซอร์ไม่ลบ
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('nodeEnv', { infer: true }) === 'production',
      path: '/',
    });
    return { ended: true };
  }
}
