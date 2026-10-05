/**
 * JWKS client ของ Core Hub (auth-contract.md ข้อ 4.1)
 *
 * ⬅ ชั้น auth ชั่วคราว: เขียนตามสัญญาทีละข้อเพราะยังเข้าถึง reference implementation
 *   (demo-student-subsystem) ไม่ได้ — เมื่อได้สิทธิ์แล้วต้องแทนที่ด้วยไฟล์ของ reference ทั้งไฟล์
 *
 *   ✔ แคชกุญแจ ไม่ยิง Core Hub ทุก request (TTL จาก JWKS_CACHE_TTL_MS)
 *   ✔ เลือกกุญแจจาก header.kid เสมอ
 *   ✔ เจอ kid ที่ไม่รู้จัก → รีเฟรชหนึ่งครั้ง แล้วยังไม่เจอ → ปฏิเสธ
 *   ✔ รีเฟรชได้ไม่ถี่กว่า JWKS_MIN_REFRESH_INTERVAL_MS (≥ 30 วินาที) กัน refresh loop
 *   ✔ Core Hub ล่มชั่วคราว → ใช้กุญแจที่แคชไว้ต่อ
 *   ✔ ปฏิเสธ JWK ที่มี private material (`d`) หรือไม่ใช่ kty RSA
 *   ✔ log jwks.refresh · jwks.refresh.failure · jwks.unknown_kid ตาม contracts/log-events.json 1.1
 *
 * เวลาของแคชใช้นาฬิกาแบบ monotonic (performance.now) ไม่ใช่นาฬิกาผนัง
 * เพราะนาฬิกาผนังถอยหลังได้ แล้วแคชจะไม่หมดอายุหรือหมดอายุก่อนเวลา
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importJWK, type JWK, type KeyLike } from 'jose';
import { performance } from 'node:perf_hooks';
import { authLog } from '../common/auth-log';
import type { AppConfig } from '../config/configuration';

/** เหตุที่รีเฟรช — ใส่ใน event jwks.refresh / jwks.refresh.failure */
type RefreshReason = 'initial' | 'cache_expired' | 'unknown_kid';

type VerifyKey = KeyLike | Uint8Array;

@Injectable()
export class JwksService {
  private readonly logger = new Logger('Auth');
  private keys = new Map<string, VerifyKey>();
  /** เวลาที่ดึงสำเร็จครั้งล่าสุด (-Infinity = ยังไม่เคย) */
  private fetchedAt = Number.NEGATIVE_INFINITY;
  /** เวลาที่พยายามดึงครั้งล่าสุด ไม่ว่าจะสำเร็จหรือไม่ — ใช้จำกัดอัตรา */
  private attemptedAt = Number.NEGATIVE_INFINITY;
  private inflight: Promise<void> | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /** เคยดึง JWKS สำเร็จอย่างน้อยหนึ่งครั้ง — false = Core Hub ล่มตั้งแต่บูต ยังไม่มีชุดกุญแจให้เทียบ */
  get hasKeySet(): boolean {
    return this.fetchedAt !== Number.NEGATIVE_INFINITY;
  }

  private get settings() {
    return this.config.get('jwks', { infer: true });
  }

  /** กุญแจสาธารณะของ kid นี้ หรือ null ถ้าไม่มีใน JWKS แม้รีเฟรชแล้ว */
  async getKey(kid: string): Promise<VerifyKey | null> {
    const now = performance.now();
    const { cacheTtlMs, minRefreshIntervalMs } = this.settings;

    if (now - this.fetchedAt > cacheTtlMs && this.canRefresh(now, minRefreshIntervalMs)) {
      await this.refresh(this.fetchedAt === Number.NEGATIVE_INFINITY ? 'initial' : 'cache_expired');
    }
    const cached = this.keys.get(kid);
    if (cached) return cached;

    // kid ไม่รู้จัก → รีเฟรชหนึ่งครั้ง (ถ้าไม่ได้เพิ่งรีเฟรชไป) แล้วตัดสินจากผลนั้น
    if (this.canRefresh(performance.now(), minRefreshIntervalMs)) {
      await this.refresh('unknown_kid');
    }
    const found = this.keys.get(kid) ?? null;
    // ไม่เคยได้ JWKS เลย → ไม่ใช่ kid แปลก (jwks.refresh.failure บอกเหตุไปแล้ว · ตัวตรวจ log jwks_unavailable)
    if (!found && this.hasKeySet) {
      authLog(this.logger, 'warn', 'jwks.unknown_kid', { kid, knownKids: [...this.keys.keys()] });
    }
    return found;
  }

  /** ครั้งแรกดึงได้เสมอ (attemptedAt = -Infinity) · หลังจากนั้นเว้นช่วงอย่างน้อย minIntervalMs */
  private canRefresh(now: number, minIntervalMs: number): boolean {
    return now - this.attemptedAt >= minIntervalMs;
  }

  /** ดึงพร้อมกันได้ทีละครั้ง — request ที่มาพร้อมกันรอผลก้อนเดียวกัน */
  private refresh(reason: RefreshReason): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.fetchKeys(reason).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async fetchKeys(reason: RefreshReason): Promise<void> {
    this.attemptedAt = performance.now();
    const { jwksUrl } = this.config.get('coreHub', { infer: true });
    try {
      const response = await fetch(jwksUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.settings.requestTimeoutMs),
      });
      if (!response.ok) throw new Error(`JWKS ตอบ HTTP ${response.status}`);
      const body = (await response.json()) as { keys?: unknown };
      // RFC 7517 ดิบ — {"keys":[...]} ที่ระดับบนสุด ไม่มี envelope (สัญญาข้อ 4.2)
      if (!Array.isArray(body.keys)) throw new Error('JWKS ไม่มี keys ที่ระดับบนสุด');

      const next = new Map<string, VerifyKey>();
      for (const raw of body.keys as JWK[]) {
        const key = await this.importPublicKey(raw);
        if (key && typeof raw.kid === 'string') next.set(raw.kid, key);
      }
      this.keys = next;
      this.fetchedAt = performance.now();
      authLog(this.logger, 'log', 'jwks.refresh', { reason, keyCount: next.size, kids: [...next.keys()] });
    } catch (error) {
      // Core Hub ล่มชั่วคราว → เก็บกุญแจเดิมไว้ใช้ต่อ (สัญญาข้อ 4.1 "ควร")
      authLog(this.logger, 'warn', 'jwks.refresh.failure', {
        reason: `${reason}: ${(error as Error).message}`.slice(0, 200),
        cachedKeyCount: this.keys.size,
      });
    }
  }

  private async importPublicKey(jwk: JWK): Promise<VerifyKey | null> {
    if (typeof jwk !== 'object' || jwk === null) return null;
    if (jwk.kty !== 'RSA') return null;
    if ('d' in jwk || 'p' in jwk || 'q' in jwk) return null; // มี private material → ห้ามใช้
    if (typeof jwk.kid !== 'string' || jwk.kid === '') return null;
    if (jwk.alg !== undefined && jwk.alg !== 'RS256') return null;
    if (jwk.use !== undefined && jwk.use !== 'sig') return null;
    try {
      return await importJWK({ kty: jwk.kty, n: jwk.n, e: jwk.e }, 'RS256');
    } catch {
      return null;
    }
  }
}
