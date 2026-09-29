import type { Permission } from './permissions';
import type { SubsystemRole } from './role-mapping';

/** core role ค่าปิด 4 ค่า (authorization.md ข้อ 2) — มาจาก claim `role` เท่านั้น */
export const CORE_ROLES = ['student', 'alumni', 'staff', 'admin'] as const;
export type CoreRole = (typeof CORE_ROLES)[number];

export const isCoreRole = (value: unknown): value is CoreRole =>
  typeof value === 'string' && (CORE_ROLES as readonly string[]).includes(value);

/** claim ที่ผ่านการตรวจครบ 8 ขั้นแล้ว (auth-contract.md ข้อ 3-4) */
export interface VerifiedClaims {
  sub: string;
  email: string;
  role: unknown;
  exp: number;
}

/** ผู้ใช้ของ request นี้ — ตัวตนมาจาก token ที่ verify แล้วเท่านั้น ไม่เคยมาจาก body/query/header อื่น */
export interface AuthUser {
  coreUserId: string;
  email: string;
  coreRole: CoreRole;
  subsystemRole: SubsystemRole;
  permissions: ReadonlySet<Permission>;
  /** วินาที epoch ที่ token หมดอายุ — อายุคุกกี้ของ SSO callback และ session.expiresAt ของ /api/v1/me */
  tokenExp: number;
}
