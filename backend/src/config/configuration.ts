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
    /** เว็บของ Core Hub ที่ /auth/login ส่งเบราว์เซอร์ไป และที่ /auth/logout พาไปหน้า /logout (สัญญา 1.1) */
    webUrl: string;
    /** เวลารอคำตอบจาก API ข้อมูลกลางของ Core Hub (เช่น /people/me) ก่อนถือว่าล่ม */
    requestTimeoutMs: number;
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
      url: (env.CORE_HUB_URL ?? '').replace(/\/+$/, ''),
      webUrl: (env.CORE_HUB_WEB_URL ?? '').replace(/\/+$/, ''),
      jwksUrl: env.CORE_HUB_JWKS_URL ?? '',
      issuer: env.CORE_HUB_ISSUER ?? '',
      audience: env.CORE_HUB_AUDIENCE ?? '',
      requestTimeoutMs: num(env.CORE_HUB_REQUEST_TIMEOUT_MS, 5_000),
    },
    jwks: {
      cacheTtlMs: num(env.JWKS_CACHE_TTL_MS, 600_000),
      minRefreshIntervalMs: num(env.JWKS_MIN_REFRESH_INTERVAL_MS, 30_000),
      requestTimeoutMs: num(env.JWKS_REQUEST_TIMEOUT_MS, 5_000),
    },
    jwtClockToleranceSec: num(env.JWT_CLOCK_TOLERANCE_SEC, 5),
  };
}
