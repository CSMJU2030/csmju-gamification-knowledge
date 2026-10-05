/**
 * Central SSO ฝั่งระบบย่อย ตามสัญญา 1.2 (auth-contract.md ข้อ 5 · 5.1 · 5.2 · 7) · public · อยู่นอก prefix /api
 *
 *   GET  /auth/login?next=   สร้าง state → คุกกี้ state → 302 ไปเว็บ Core Hub /sso/authorize (ไม่ส่ง callback_url)
 *   GET  /auth/callback      ตรวจ state กับคุกกี้ → ตรวจ token ครบ 10 ขั้น → คุกกี้ session → 302 ไปหน้า next
 *                            ไม่สำเร็จ: JSON envelope ตามปกติ · เบราว์เซอร์ที่ขอ text/html ได้หน้าพร้อมปุ่ม (status เดิม)
 *   POST /auth/logout        ลบคุกกี้ของตัวเองทั้งสอง → 303 ไปหน้า /logout ของ Core Hub (ออกทั้งระบบ)
 *
 * ไม่มีหน้าฟอร์ม ไม่ออก token หรือ session ของตัวเอง — session คือ Core Hub token ที่ verify แล้วเท่านั้น
 * ทุกคำตอบมี Cache-Control: no-store · callback มี Referrer-Policy: no-referrer เพิ่ม (URL มี token)
 * log ได้แค่ path — ห้าม log URL เต็มของ callback และ header Cookie ทั้งก้อน (contracts/log-events.json)
 *
 * ⬅ ชั้น auth ชั่วคราว: ต้องแทนที่ด้วยไฟล์ของ reference implementation เมื่อได้สิทธิ์เข้าถึง
 */
import { Controller, Get, HttpCode, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiError, badRequest, unauthorized } from '../common/api-error';
import { authLog, type FailureReason } from '../common/auth-log';
import { ApiErrors } from '../common/swagger';
import type { AppConfig } from '../config/configuration';
import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import { Public } from './decorators/public.decorator';
import { readCookie, toAuthUser } from './guards/core-hub-jwt.guard';
import { ssoErrorPage, wantsHtml } from './sso-error-page';
import {
  CALLBACK_PATH,
  CORE_HUB_AUTHORIZE_PATH,
  CORE_HUB_LOGOUT_PATH,
  LOGIN_PATH,
  SESSION_COOKIE,
  STATE_COOKIE,
  newState,
  parseStateCookie,
  safeNext,
  sameState,
  sessionCookieOptions,
  stateCookieOptions,
  stateCookieValue,
} from './sso';

type SsoFailure = Extract<FailureReason, 'sso_restart_without_state' | 'sso_state_missing' | 'sso_state_mismatch'>;

@ApiTags('auth')
@Controller('auth')
export class SsoController {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly verifier: CoreHubTokenVerifier,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private get production(): boolean {
    return this.config.get('nodeEnv', { infer: true }) === 'production';
  }

  private get coreHubWeb(): string {
    return this.config.get('coreHub.webUrl', { infer: true });
  }

  /** event ปิดของ contracts/log-events.json — มีแค่เหตุผลกับ path ไม่มี token ไม่มี URL เต็ม */
  private logSso(reason: SsoFailure): void {
    authLog(this.logger, 'warn', 'jwt.verification.failure', { reason, kid: null, path: CALLBACK_PATH });
  }

  @Public()
  @Get('login')
  @ApiOperation({
    summary: 'เริ่มทุกการเข้าสู่ระบบ — สร้าง state แล้วส่งไปเว็บ Core Hub /sso/authorize (ไม่มีหน้าฟอร์ม)',
    security: [],
  })
  @ApiQuery({ name: 'next', required: false, type: String, description: 'path ในระบบนี้ที่จะกลับไปหลัง login · ไม่ผ่านกฎใช้หน้าแรก' })
  @ApiResponse({ status: 302, description: 'ไป {CORE_HUB_WEB_URL}/sso/authorize?subsystem=…&state=… พร้อมคุกกี้ state' })
  login(@Query('next') next: unknown, @Res() res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    const state = newState();
    res.cookie(STATE_COOKIE, stateCookieValue(state, safeNext(next)), stateCookieOptions(this.production));
    const target = new URL(`${this.coreHubWeb}${CORE_HUB_AUTHORIZE_PATH}`);
    target.searchParams.set('subsystem', this.config.get('subsystemId', { infer: true }));
    target.searchParams.set('state', state);
    res.redirect(302, target.toString());
  }

  @Public()
  @Get('callback')
  @ApiOperation({ summary: 'Central SSO callback — ผลตามข้อ 5.1 ของสัญญา', security: [] })
  @ApiQuery({ name: 'access_token', required: true, type: String })
  @ApiQuery({ name: 'token_type', required: false, enum: ['Bearer'] })
  @ApiQuery({ name: 'expires_in', required: false, type: String })
  @ApiQuery({ name: 'state', required: false, type: String })
  @ApiResponse({
    status: 302,
    description: 'สำเร็จ — ตั้งคุกกี้ session แล้วไปหน้า next · หรือไม่มี state (เริ่มจาก Core Hub) — ทิ้ง token แล้วไป /auth/login',
  })
  @ApiErrors(400, 401, 403)
  async callback(
    @Query('access_token') accessToken: unknown,
    @Query('state') state: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      await this.completeCallback(accessToken, state, req, res);
    } catch (error) {
      // เบราว์เซอร์: หน้าพร้อมปุ่ม "เข้าสู่ระบบอีกครั้ง" (ข้อ 5.1) แทน JSON ดิบ · คุกกี้ state ถูกเผาไปแล้วตามเดิม
      if (!(error instanceof ApiError) || !wantsHtml(req)) throw error;
      const status = error.getStatus();
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
      res.status(status).type('html').send(ssoErrorPage(status, `${this.coreHubWeb}/`));
    }
  }

  private async completeCallback(accessToken: unknown, state: unknown, req: Request, res: Response): Promise<void> {
    const hasState = typeof state === 'string' && state !== '';
    // เผาคุกกี้ state ก่อนตรวจอะไรทั้งนั้น — state ใช้ได้ครั้งเดียวไม่ว่าผลจะออกมาแบบไหน
    const stored = hasState ? parseStateCookie(readCookie(req.headers.cookie, STATE_COOKIE)) : null;
    if (hasState) res.cookie(STATE_COOKIE, '', stateCookieOptions(this.production, 0));

    if (typeof accessToken !== 'string' || accessToken.trim() === '') {
      throw badRequest('ต้องมี access_token จาก Core Hub');
    }

    if (!hasState) {
      // เริ่มจาก sidebar ของ Core Hub (ไม่มี state) — ทิ้ง token ไม่แตะคุกกี้ใด ๆ แล้วเริ่ม sign-in ของเราเอง
      this.logSso('sso_restart_without_state');
      res.redirect(302, LOGIN_PATH);
      return;
    }
    if (!stored) {
      this.logSso('sso_state_missing');
      throw unauthorized('ไม่พบคุกกี้ state ของการเข้าสู่ระบบนี้ — เริ่มใหม่ที่ /auth/login');
    }
    if (!sameState(state, stored.state)) {
      this.logSso('sso_state_mismatch');
      throw unauthorized('state ไม่ตรงกับการเข้าสู่ระบบที่เริ่มไว้ — เริ่มใหม่ที่ /auth/login');
    }

    // ตรวจครบ 10 ขั้น + แมป role ก่อนตั้งคุกกี้ session — พังตรงไหนก็ไม่มีคุกกี้ session ออกไป (401 / 403)
    const user = toAuthUser(await this.verifier.verify(accessToken, CALLBACK_PATH));
    const remainingMs = user.tokenExp * 1000 - Date.now();
    if (remainingMs <= 0) throw unauthorized('token หมดอายุแล้ว — เข้าสู่ระบบผ่าน Core Hub ใหม่');

    res.cookie(SESSION_COOKIE, accessToken, sessionCookieOptions(this.production, remainingMs));
    // next มาจากคุกกี้ — ตรวจซ้ำก่อนใช้ทุกครั้ง
    res.redirect(302, safeNext(stored.next));
  }

  @Public()
  @Post('logout')
  @HttpCode(303)
  @ApiOperation({
    summary: 'ออกจากระบบทั้งระบบ — ลบคุกกี้ของระบบนี้ทั้งสอง แล้วไปหน้า /logout ของ Core Hub',
    security: [],
  })
  @ApiResponse({ status: 303, description: 'ไป {CORE_HUB_WEB_URL}/logout' })
  logout(@Res() res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(SESSION_COOKIE, '', sessionCookieOptions(this.production, 0));
    res.cookie(STATE_COOKIE, '', stateCookieOptions(this.production, 0));
    res.redirect(303, `${this.coreHubWeb}${CORE_HUB_LOGOUT_PATH}`);
  }
}
