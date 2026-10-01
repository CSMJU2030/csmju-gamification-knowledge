/**
 * ตรวจ access token ของ Core Hub ครบ 10 ขั้น (auth-contract.md 1.2 ข้อ 4) — ไม่มีขั้นไหนข้ามได้แม้ใน dev
 * ใช้ทั้งกับทุก request ที่ต้องล็อกอิน และกับ token ที่มาทาง /auth/callback
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
 *   8. ต้องมี sub ที่ไม่ว่าง — sub เป็น string ทึบ ไม่ใช่ UUID เสมอไป (เช่น user-<รหัสนักศึกษา>) จึงไม่ตรวจรูปแบบ
 *   9. ต้องมี iat และ exp − iat ไม่เกิน 900 + 60 วินาที — กัน refresh token (อายุ 7 วัน) ถูกใช้แทน access token
 *  10. ถ้ามี azp ต้องเท่ากับชื่อระบบนี้ (SUBSYSTEM_ID) — กัน token ที่ออกให้ระบบอื่นถูกนำมาใช้ที่นี่
 *
 * ทุกขั้นที่ไม่ผ่าน → 401 UNAUTHORIZED ข้อความเดียวกัน (ไม่บอกผู้โจมตีว่าพังขั้นไหน)
 * แต่ log event `jwt.verification.failure` พร้อม reason · kid · path ไว้ให้ทีมตามได้ (contracts/log-events.json 1.1)
 * claim อื่นที่ไม่อยู่ในสัญญาไม่ทำให้ปฏิเสธ — Core Hub เพิ่ม claim ได้โดยไม่ถือว่าผิดสัญญา
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeProtectedHeader, errors, jwtVerify, type ProtectedHeaderParameters } from 'jose';
import { type ApiError, unauthorized } from '../common/api-error';
import type { AppConfig } from '../config/configuration';
import type { VerifiedClaims } from './auth.types';
import { JwksService } from './jwks.service';

const ALLOWED_ALGORITHMS = ['RS256'];

/** contracts/jwt-contract.json 1.2: maxTokenLifetimeSeconds · clockToleranceSeconds */
export const MAX_TOKEN_LIFETIME_SEC = 900;
export const LIFETIME_TOLERANCE_SEC = 60;

/** reason ของ jwt.verification.failure ที่ตัวตรวจนี้ใช้ — ชุดย่อยของ failureReasons ใน log-events.json */
export type TokenFailureReason =
  | 'missing_token'
  | 'malformed_token'
  | 'unsupported_algorithm'
  | 'missing_kid'
  | 'unknown_kid'
  | 'invalid_signature'
  | 'expired'
  | 'invalid_issuer'
  | 'invalid_audience'
  | 'invalid_claims'
  | 'token_lifetime_exceeded'
  | 'invalid_azp';

/** แปลง error ของ jose เป็น reason ปิดของสัญญา log */
function reasonOf(error: unknown): TokenFailureReason {
  if (error instanceof errors.JWTExpired) return 'expired';
  if (error instanceof errors.JWSSignatureVerificationFailed) return 'invalid_signature';
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === 'iss') return 'invalid_issuer';
    if (error.claim === 'aud') return 'invalid_audience';
    // ไม่มี iat = ตรวจอายุ token (ขั้น 9) ไม่ได้
    if (error.claim === 'iat') return 'token_lifetime_exceeded';
    return 'invalid_claims';
  }
  if (error instanceof errors.JOSEAlgNotAllowed) return 'unsupported_algorithm';
  return 'malformed_token';
}

@Injectable()
export class CoreHubTokenVerifier {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly jwks: JwksService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * @param path path ของ request ที่ส่ง token มา (ไม่มี query) — ใส่ใน log เท่านั้น
   */
  async verify(token: string, path = ''): Promise<VerifiedClaims> {
    let kid: string | null = null;
    const reject = (reason: TokenFailureReason): ApiError => {
      // event ปิดของ contracts/log-events.json — ไม่มี token ไม่มี URL เต็ม ไม่มีข้อมูลบุคคล
      this.logger.warn(JSON.stringify({ event: 'jwt.verification.failure', reason, kid, path }));
      return unauthorized('token ใช้ไม่ได้หรือหมดอายุ — เข้าสู่ระบบผ่าน Core Hub ใหม่');
    };

    // 1
    if (typeof token !== 'string' || token.trim() === '') throw reject('missing_token');

    // 2
    let header: ProtectedHeaderParameters;
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw reject('malformed_token');
    }

    // 3
    if (!ALLOWED_ALGORITHMS.includes(header.alg ?? '')) throw reject('unsupported_algorithm');

    // 4
    if (typeof header.kid !== 'string' || header.kid === '') throw reject('missing_kid');
    kid = header.kid;
    const key = await this.jwks.getKey(header.kid);
    if (!key) throw reject('unknown_kid');

    // 5 · 6 · 7
    const { issuer, audience } = this.config.get('coreHub', { infer: true });
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: ALLOWED_ALGORITHMS,
        issuer,
        audience,
        clockTolerance: this.config.get('jwtClockToleranceSec', { infer: true }),
        requiredClaims: ['exp', 'sub', 'iat'],
      }));
    } catch (error) {
      throw reject(reasonOf(error));
    }

    // 8
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.trim() === '') throw reject('invalid_claims');

    // 9 — jose ตรวจแล้วว่า iat และ exp เป็นตัวเลข · อายุที่ประกาศใน token ต้องไม่ยาวกว่า access token
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    if (exp - iat > MAX_TOKEN_LIFETIME_SEC + LIFETIME_TOLERANCE_SEC) throw reject('token_lifetime_exceeded');

    // 10 — ตอนนี้ตรวจเมื่อมี azp เท่านั้น (เวอร์ชันถัดไปของสัญญาจะบังคับให้ต้องมี)
    if (payload.azp !== undefined && payload.azp !== this.config.get('subsystemId', { infer: true })) {
      throw reject('invalid_azp');
    }

    return {
      sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      role: payload.role,
      exp,
    };
  }
}
