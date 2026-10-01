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
 *
 * เวลาของแคชใช้นาฬิกาแบบ monotonic (performance.now) ไม่ใช่นาฬิกาผนัง
 * เพราะนาฬิกาผนังถอยหลังได้ แล้วแคชจะไม่หมดอายุหรือหมดอายุก่อนเวลา
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importJWK, type JWK, type KeyLike } from 'jose';
import { performance } from 'node:perf_hooks';
import type { AppConfig } from '../config/configuration';

type VerifyKey = KeyLike | Uint8Array;

@Injectable()
export class JwksService {
  private readonly logger = new Logger(JwksService.name);
  private keys = new Map<string, VerifyKey>();
  /** เวลาที่ดึงสำเร็จครั้งล่าสุด (-Infinity = ยังไม่เคย) */
  private fetchedAt = Number.NEGATIVE_INFINITY;
  /** เวลาที่พยายามดึงครั้งล่าสุด ไม่ว่าจะสำเร็จหรือไม่ — ใช้จำกัดอัตรา */
  private attemptedAt = Number.NEGATIVE_INFINITY;
  private inflight: Promise<void> | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get settings() {
    return this.config.get('jwks', { infer: true });
  }

  /** กุญแจสาธารณะของ kid นี้ หรือ null ถ้าไม่มีใน JWKS แม้รีเฟรชแล้ว */
  async getKey(kid: string): Promise<VerifyKey | null> {
    const now = performance.now();
    const { cacheTtlMs, minRefreshIntervalMs } = this.settings;

    if (now - this.fetchedAt > cacheTtlMs && this.canRefresh(now, minRefreshIntervalMs)) {
      await this.refresh();
    }
    const cached = this.keys.get(kid);
    if (cached) return cached;

    // kid ไม่รู้จัก → รีเฟรชหนึ่งครั้ง (ถ้าไม่ได้เพิ่งรีเฟรชไป) แล้วตัดสินจากผลนั้น
    if (this.canRefresh(performance.now(), minRefreshIntervalMs)) {
      await this.refresh();
      return this.keys.get(kid) ?? null;
    }
    return null;
  }

  /** ครั้งแรกดึงได้เสมอ (attemptedAt = -Infinity) · หลังจากนั้นเว้นช่วงอย่างน้อย minIntervalMs */
  private canRefresh(now: number, minIntervalMs: number): boolean {
    return now - this.attemptedAt >= minIntervalMs;
  }

  /** ดึงพร้อมกันได้ทีละครั้ง — request ที่มาพร้อมกันรอผลก้อนเดียวกัน */
  private refresh(): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.fetchKeys().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async fetchKeys(): Promise<void> {
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
    } catch (error) {
      // Core Hub ล่มชั่วคราว → เก็บกุญแจเดิมไว้ใช้ต่อ (สัญญาข้อ 4.1 "ควร")
      this.logger.warn(`ดึง JWKS ไม่สำเร็จ ใช้กุญแจที่แคชไว้ ${this.keys.size} ดอก: ${(error as Error).message}`);
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
