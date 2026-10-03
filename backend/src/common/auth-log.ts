/**
 * structured log ด้านการยืนยันตัวตน/สิทธิ์ — ชื่อ event · field · reason เป็นรายการปิดของ
 * standards/contracts/log-events.json 1.1 (standards/docs/logging.md)
 *
 * ทุกบรรทัดเป็น JSON บรรทัดเดียว `{"event": ..., ...fields}` ค้นใน log ได้ด้วยชื่อ event
 * type ของแต่ละ event บังคับ field ให้ครบและไม่เกิน — เพิ่ม field ใหม่ต้องแก้ที่นี่ก่อน
 * ห้ามใส่ token · header Authorization/Cookie · URL ที่มี query · ชื่อ อีเมล หรือข้อมูลบุคคลอื่น — ระบุผู้ใช้ด้วย sub อย่างเดียว
 */
import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { SUBSYSTEM_NAME } from '../config/env.validation';

/** failureReasons ของ log-events.json — ใช้กับ jwt.verification.failure */
export type FailureReason =
  | 'missing_token'
  | 'malformed_token'
  | 'unsupported_algorithm'
  | 'missing_kid'
  | 'unknown_kid'
  | 'jwks_unavailable'
  | 'invalid_signature'
  | 'expired'
  | 'invalid_issuer'
  | 'invalid_audience'
  | 'invalid_claims'
  | 'sso_restart_without_state'
  | 'sso_state_missing'
  | 'sso_state_mismatch'
  | 'token_lifetime_exceeded'
  | 'invalid_azp';

/** field ที่ต้องมีของแต่ละ event (log-events.json 1.1 → required[].fields) */
export interface AuthEventFields {
  'subsystem.started': {
    subsystem: string;
    port: number;
    coreHubUrl: string;
    jwksUrl: string;
    issuer: string;
    audience: string;
  };
  'jwt.verification.success': { sub: string; coreRole: string; subsystemRole: string };
  'jwt.verification.failure': { reason: FailureReason; kid: string | null; path: string };
  'jwks.refresh': { reason: string; keyCount: number; kids: string[] };
  'jwks.refresh.failure': { reason: string; cachedKeyCount: number };
  'jwks.unknown_kid': { kid: string; knownKids: string[] };
  'authorization.role_mapping_failed': { sub: string; coreRole: string | null };
  'authorization.denied': {
    sub: string | null;
    subsystemRole: string | null;
    required: readonly string[];
    reason: string;
    path: string;
  };
}

export type AuthEvent = keyof AuthEventFields;

export function authLog<E extends AuthEvent>(
  logger: Logger,
  level: 'log' | 'warn',
  event: E,
  fields: AuthEventFields[E],
): void {
  logger[level](JSON.stringify({ event, ...fields }));
}

/** field ของ subsystem.started — ค่าตั้งของ Core Hub ที่ระบบนี้ใช้จริง (ไม่มีความลับ) ไว้ไล่ปัญหา "ต่อ Core Hub ตัวไหนอยู่" */
export function startedFields(config: ConfigService<AppConfig, true>): AuthEventFields['subsystem.started'] {
  const hub = config.get('coreHub', { infer: true });
  return {
    subsystem: SUBSYSTEM_NAME,
    port: config.get('port', { infer: true }),
    coreHubUrl: hub.url,
    jwksUrl: hub.jwksUrl,
    issuer: hub.issuer,
    audience: hub.audience,
  };
}
