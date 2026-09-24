/**
 * ค่าตั้งของระบบ — อ่านจาก environment ที่เดียว แล้วส่งต่อผ่าน ConfigService
 *
 * ค่าของสัญญา Core Hub (issuer / audience) อ่านจาก env ตาม auth-contract.md ข้อ 2
 * ("ให้โค้ดอ่านจากไฟล์/env ไม่ใช่พิมพ์ค่าเอง") และ env.validation.ts ตรวจว่าตรงกับสัญญา
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  subsystemId: string;
  coreHub: {
    url: string;
    jwksUrl: string;
    issuer: string;
    audience: string;
  };
  jwks: {
    cacheTtlMs: number;
    minRefreshIntervalMs: number;
    requestTimeoutMs: number;
  };
  jwtClockToleranceSec: number;
  /** ถ้าตั้งไว้ `GET /auth/callback` จะพาไปหน้านี้ (302) หลังตั้ง session แล้ว — ว่าง = ตอบ JSON */
  ssoSuccessRedirect: string | null;
}

const num = (value: string | undefined, fallback: number): number =>
  value === undefined || value.trim() === '' ? fallback : Number(value);

export function configuration(): AppConfig {
  const env = process.env;
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: num(env.PORT, 3002),
    databaseUrl: env.DATABASE_URL ?? '',
    subsystemId: env.SUBSYSTEM_ID ?? '',
    coreHub: {
      url: env.CORE_HUB_URL ?? '',
      jwksUrl: env.CORE_HUB_JWKS_URL ?? '',
      issuer: env.CORE_HUB_ISSUER ?? '',
      audience: env.CORE_HUB_AUDIENCE ?? '',
    },
    jwks: {
      cacheTtlMs: num(env.JWKS_CACHE_TTL_MS, 600_000),
      minRefreshIntervalMs: num(env.JWKS_MIN_REFRESH_INTERVAL_MS, 30_000),
      requestTimeoutMs: num(env.JWKS_REQUEST_TIMEOUT_MS, 5_000),
    },
    jwtClockToleranceSec: num(env.JWT_CLOCK_TOLERANCE_SEC, 5),
    ssoSuccessRedirect: env.SSO_SUCCESS_REDIRECT?.trim() ? env.SSO_SUCCESS_REDIRECT.trim() : null,
  };
}
