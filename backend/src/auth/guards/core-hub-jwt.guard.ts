/**
 * CoreHubJwtGuard — ทุก route ที่ไม่ใช่ @Public ต้องมี token ที่ผ่านการตรวจครบ 8 ขั้น (→ 401)
 * แล้วแมป core role เป็น role ของระบบนี้ (role ที่ไม่มีในตาราง → 403)
 *
 * รับ token ได้สองทางและตรวจเหมือนกัน (auth-contract.md ข้อ 6):
 *   Authorization: Bearer <token>              ← มาก่อนเสมอถ้ามี
 *   Cookie: csmju_gamification_knowledge_access_token=<token>   ← เบราว์เซอร์ที่ผ่าน SSO มาแล้ว
 * คุกกี้อื่นของ localhost (เช่นของเว็บ Core Hub) ไม่อ่าน
 * ตัวตนไม่เคยมาจาก body / query / custom header
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../../common/api-error';
import { type AuthUser, type VerifiedClaims, isCoreRole } from '../auth.types';
import { CoreHubTokenVerifier } from '../core-hub-token.verifier';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { permissionsFor } from '../permissions';
import { mapCoreRole } from '../role-mapping';
import { SESSION_COOKIE } from '../sso';

/** อ่านคุกกี้ชื่อเดียวจาก header ตรง ๆ (cookie-parser ไม่อยู่ใน whitelist ของ stack) */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function extractToken(req: Request): string {
  const header = req.headers.authorization;
  if (header !== undefined) {
    const match = /^Bearer[ ]+([^\s]+)$/i.exec(header.trim());
    if (!match) throw unauthorized('Authorization ต้องเป็นรูปแบบ Bearer <token>');
    return match[1];
  }
  const cookie = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (cookie) return cookie;
  throw unauthorized();
}

/** claim ที่ verify แล้ว → ผู้ใช้ของระบบนี้ · role ที่ระบบนี้ไม่รับ = รู้ตัวตนแล้วแต่ไม่มีสิทธิ์ → 403 */
export function toAuthUser(claims: VerifiedClaims): AuthUser {
  if (!isCoreRole(claims.role)) throw forbidden('core role นี้เข้าใช้ Code Tower ไม่ได้');
  const subsystemRole = mapCoreRole(claims.role);
  if (!subsystemRole) throw forbidden('core role นี้เข้าใช้ Code Tower ไม่ได้');
  return {
    coreUserId: claims.sub,
    email: claims.email,
    coreRole: claims.role,
    subsystemRole,
    permissions: permissionsFor(subsystemRole),
    tokenExp: claims.exp,
  };
}

@Injectable()
export class CoreHubJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: CoreHubTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const claims = await this.verifier.verify(extractToken(req));
    req.user = toAuthUser(claims);
    return true;
  }
}
