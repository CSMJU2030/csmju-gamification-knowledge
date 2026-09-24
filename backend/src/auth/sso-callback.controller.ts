/**
 * GET /auth/callback — ปลายทางของ Central SSO (auth-contract.md ข้อ 5.1) · public · อยู่นอก /api
 *
 * ⬅ ชั้น auth ชั่วคราว: ต้องแทนที่ด้วยไฟล์ของ reference implementation เมื่อได้สิทธิ์เข้าถึง
 *
 *   ✔ ตรวจ token ครบ 8 ขั้นก่อนตั้ง session เสมอ — ไม่ผ่าน → 401 และไม่มี Set-Cookie
 *   ✔ คุกกี้ `core_hub_access_token` HttpOnly + SameSite=Lax (+ Secure เมื่อ production)
 *   ✔ อายุคุกกี้ไม่ยาวกว่า exp ของ token
 *   ✔ ส่ง state กลับให้ client ตรวจ
 *   ✔ ไม่ออก token ของตัวเอง — session คือ Core Hub token ที่ verify แล้วเท่านั้น
 */
import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { badRequest, unauthorized } from '../common/api-error';
import { wrap } from '../common/envelope';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import type { AppConfig } from '../config/configuration';
import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import { Public } from './decorators/public.decorator';
import { SESSION_COOKIE, toAuthUser } from './guards/core-hub-jwt.guard';
import { MeDto } from './me.dto';
import { toMe } from './me.controller';

@ApiTags('auth')
@Controller('auth')
export class SsoCallbackController {
  constructor(
    private readonly verifier: CoreHubTokenVerifier,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Get('callback')
  @ApiOperation({ summary: 'Central SSO callback — ตรวจ token แล้วตั้ง session cookie', security: [] })
  @ApiQuery({ name: 'access_token', required: true, type: String })
  @ApiQuery({ name: 'token_type', required: false, enum: ['Bearer'] })
  @ApiQuery({ name: 'expires_in', required: false, type: String })
  @ApiQuery({ name: 'state', required: false, type: String })
  @ApiSuccess(MeDto, { description: 'ตรวจ token ผ่าน และตั้ง session cookie' })
  @ApiResponse({ status: 302, description: 'ตรวจ token ผ่าน และพาไปหน้า UI (เมื่อตั้ง SSO_SUCCESS_REDIRECT)' })
  @ApiErrors(400, 401, 403)
  async callback(
    @Query('access_token') accessToken: unknown,
    @Query('state') state: unknown,
    @Res() res: Response,
  ): Promise<void> {
    if (typeof accessToken !== 'string' || accessToken.trim() === '') {
      throw badRequest('ต้องมี access_token จาก Core Hub');
    }
    // ตรวจครบ 8 ขั้น + แมป role ก่อนแตะ response — พังตรงไหนก็ไม่มี Set-Cookie ออกไป
    const user = toAuthUser(await this.verifier.verify(accessToken));

    const remainingMs = user.tokenExp * 1000 - Date.now();
    if (remainingMs <= 0) throw unauthorized('token หมดอายุแล้ว — เข้าสู่ระบบผ่าน Core Hub ใหม่');

    res.cookie(SESSION_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('nodeEnv', { infer: true }) === 'production',
      path: '/',
      maxAge: remainingMs,
    });

    const echoedState = typeof state === 'string' && state !== '' ? state : undefined;
    const redirect = this.config.get('ssoSuccessRedirect', { infer: true });
    if (redirect) {
      const target = new URL(redirect);
      if (echoedState) target.searchParams.set('state', echoedState);
      res.redirect(302, target.toString());
      return;
    }
    const me: MeDto = { ...toMe(user), ...(echoedState ? { state: echoedState } : {}) };
    res.status(200).json(wrap(me));
  }
}
