/**
 * ตรวจ access token ของ Core Hub ครบ 8 ขั้น (auth-contract.md ข้อ 4) — ไม่มีขั้นไหนข้ามได้แม้ใน dev
 *
 * ⬅ ชั้น auth ชั่วคราว: ต้องแทนที่ด้วยไฟล์ของ reference implementation เมื่อได้สิทธิ์เข้าถึง
 *
 *   1. มี token (ผู้เรียกส่งมา — ดู core-hub-jwt.guard.ts)
 *   2. ถอด header เพื่ออ่าน alg / kid (ยังไม่เชื่อ payload)
 *   3. alg ต้องเป็น RS256 เท่านั้น
 *   4. หา public key จาก JWKS ตาม kid
 *   5. ตรวจลายเซ็น — ระบุ algorithm allow-list ซ้ำอีกชั้นตอน verify
 *   6. ตรวจ iss / aud
 *   7. ตรวจ exp (ยอมรับ clock skew ตาม JWT_CLOCK_TOLERANCE_SEC ซึ่ง ≤ 60 วินาที)
 *   8. ต้องมี sub ที่ไม่ว่าง
 * ทุกขั้นที่ไม่ผ่าน → 401 UNAUTHORIZED ข้อความเดียวกัน (ไม่บอกผู้โจมตีว่าพังขั้นไหน)
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeProtectedHeader, jwtVerify, type ProtectedHeaderParameters } from 'jose';
import { unauthorized } from '../common/api-error';
import type { AppConfig } from '../config/configuration';
import type { VerifiedClaims } from './auth.types';
import { JwksService } from './jwks.service';

const ALLOWED_ALGORITHMS = ['RS256'];

@Injectable()
export class CoreHubTokenVerifier {
  constructor(
    private readonly jwks: JwksService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async verify(token: string): Promise<VerifiedClaims> {
    const rejected = () => unauthorized('token ใช้ไม่ได้หรือหมดอายุ — เข้าสู่ระบบผ่าน Core Hub ใหม่');

    // 1
    if (typeof token !== 'string' || token.trim() === '') throw rejected();

    // 2
    let header: ProtectedHeaderParameters;
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw rejected();
    }

    // 3
    if (!ALLOWED_ALGORITHMS.includes(header.alg ?? '')) throw rejected();

    // 4
    if (typeof header.kid !== 'string' || header.kid === '') throw rejected();
    const key = await this.jwks.getKey(header.kid);
    if (!key) throw rejected();

    // 5 · 6 · 7
    const { issuer, audience } = this.config.get('coreHub', { infer: true });
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: ALLOWED_ALGORITHMS,
        issuer,
        audience,
        clockTolerance: this.config.get('jwtClockToleranceSec', { infer: true }),
        requiredClaims: ['exp', 'sub'],
      }));
    } catch {
      throw rejected();
    }

    // 8
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.trim() === '') throw rejected();

    return {
      sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      role: payload.role,
      exp: typeof payload.exp === 'number' ? payload.exp : 0,
    };
  }
}
