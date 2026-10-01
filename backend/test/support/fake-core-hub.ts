/**
 * Core Hub จำลองสำหรับเทสต์ — เปิด JWKS บนพอร์ตสุ่มและออก token ด้วยกุญแจที่สร้างในเทสต์เอง
 *
 * มีไว้ทดสอบชั้น auth ของระบบย่อยเท่านั้น (ไม่ใช่ Core Hub จริง และไม่ถูก build เข้าแอป)
 * กุญแจทุกดอกสร้างใหม่ทุกครั้งที่รันเทสต์ ไม่มีกุญแจจริงของใครอยู่ใน repo
 */
import { createServer, type Server } from 'node:http';
import { generateKeyPairSync, createHmac, createSign, randomUUID, type KeyObject } from 'node:crypto';
import type { AddressInfo } from 'node:net';

export type CoreRoleClaim = 'student' | 'alumni' | 'staff' | 'lecturer' | 'guest' | 'admin';

const b64url = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

export interface SignOptions {
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  omit?: string[];
  key?: KeyObject;
}

export class FakeCoreHub {
  readonly kid = 'core-hub-2026';
  private keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  readonly foreignKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  private server?: Server;
  /** จำนวนครั้งที่มีคนดึง JWKS — ใช้ตรวจแคชและการจำกัดอัตรา */
  jwksHits = 0;
  /** true = ตอบ 503 เหมือน Core Hub ล่ม */
  down = false;
  /** kid ที่ JWKS เผยแพร่อยู่ตอนนี้ (หมุนกุญแจได้ด้วยการเปลี่ยนค่า) */
  publishedKid = this.kid;
  /** JWK เพิ่มเติมที่อยากให้อยู่ใน JWKS (เช่น กุญแจที่มี private material) */
  extraJwks: Record<string, unknown>[] = [];
  url = '';

  get jwksUrl(): string {
    return `${this.url}/api/v1/.well-known/jwks.json`;
  }

  publicJwk(): Record<string, unknown> {
    return { ...this.keyPair.publicKey.export({ format: 'jwk' }), kid: this.publishedKid, use: 'sig', alg: 'RS256' };
  }

  privateJwk(): Record<string, unknown> {
    return { ...this.keyPair.privateKey.export({ format: 'jwk' }), kid: this.publishedKid, use: 'sig', alg: 'RS256' };
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      if (req.url === '/api/v1/.well-known/jwks.json') {
        this.jwksHits += 1;
        if (this.down) {
          res.writeHead(503).end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [this.publicJwk(), ...this.extraJwks] }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
  }

  /** token แบบที่ Core Hub ออกจริง (RS256 · kid · iss · aud · 15 นาที) ปรับได้ทุกช่อง */
  sign(sub: string, role: CoreRoleClaim | string, options: SignOptions = {}): string {
    const iat = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT', kid: this.kid, ...options.header };
    const payload: Record<string, unknown> = {
      sub, email: `${sub}@core.local`, role, sid: randomUUID(),
      iss: 'core-hub', aud: 'csmju2030', iat, exp: iat + 900, ...options.payload,
    };
    for (const k of options.omit ?? []) delete payload[k];
    const input = `${b64url(header)}.${b64url(payload)}`;
    const sig = createSign('RSA-SHA256').update(input).end().sign(options.key ?? this.keyPair.privateKey).toString('base64url');
    return `${input}.${sig}`;
  }

  /** token ที่ลงนามแบบสมมาตร — ระบบย่อยต้องปฏิเสธเสมอ */
  signSymmetric(sub: string, role: string): string {
    const header = { alg: 'HS' + '256', typ: 'JWT', kid: this.kid };
    const iat = Math.floor(Date.now() / 1000);
    const payload = { sub, role, iss: 'core-hub', aud: 'csmju2030', iat, exp: iat + 900 };
    const input = `${b64url(header)}.${b64url(payload)}`;
    return `${input}.${createHmac('sha256', 'attacker-secret').update(input).digest('base64url')}`;
  }

  unsigned(sub: string, role: string): string {
    const iat = Math.floor(Date.now() / 1000);
    return `${b64url({ alg: 'none', typ: 'JWT', kid: this.kid })}.${b64url({ sub, role, iss: 'core-hub', aud: 'csmju2030', iat, exp: iat + 900 })}.`;
  }
}

/** ค่า env ที่ทุกเทสต์ใช้ — ชี้ JWKS ไปที่ Core Hub จำลอง */
export function testEnv(hub: FakeCoreHub, databaseUrl = 'postgresql://127.0.0.1:1/unit_tests_never_connect'): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    SUBSYSTEM_ID: 'csmju-gamification-knowledge',
    CORE_HUB_URL: hub.url,
    CORE_HUB_WEB_URL: 'http://localhost:3100',
    CORE_HUB_JWKS_URL: hub.jwksUrl,
    CORE_HUB_ISSUER: 'core-hub',
    CORE_HUB_AUDIENCE: 'csmju2030',
    JWKS_CACHE_TTL_MS: '600000',
    JWKS_MIN_REFRESH_INTERVAL_MS: '30000',
    JWKS_REQUEST_TIMEOUT_MS: '2000',
    JWT_CLOCK_TOLERANCE_SEC: '5',
  };
}
