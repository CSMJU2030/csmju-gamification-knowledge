/**
 * core role → subsystem role (authorization.md ข้อ 3)
 *
 * ⬅ แก้ได้เฉพาะค่าในตาราง และต้องตรงกับ `default_role_mapping` ที่ลงทะเบียนกับ Core Hub
 * ค่าในตารางนี้คือข้อเสนอ D3 (docs/design-csmju-migration.md) — รอ PL ยืนยันก่อนลงทะเบียน
 *
 *   student → PLAYER       เล่นเกม
 *   alumni  → PLAYER       เล่นเกม
 *   staff   → INSTRUCTOR   เล่นได้ + สร้างโจทย์ BloxCode (D4)
 *   admin   → ADMIN        ทุกอย่าง รวมข้อมูลของทุกคน
 *
 * core role ที่ไม่มีในตาราง = เข้าระบบนี้ไม่ได้ → 403 (ไม่ใช่ 401)
 */
import type { CoreRole } from './auth.types';

export const CORE_ROLE_TO_SUBSYSTEM_ROLE = {
  student: 'PLAYER',
  alumni: 'PLAYER',
  staff: 'INSTRUCTOR',
  admin: 'ADMIN',
} as const satisfies Partial<Record<CoreRole, string>>;

export type SubsystemRole = (typeof CORE_ROLE_TO_SUBSYSTEM_ROLE)[keyof typeof CORE_ROLE_TO_SUBSYSTEM_ROLE];

export function mapCoreRole(role: CoreRole): SubsystemRole | null {
  const table: Partial<Record<CoreRole, SubsystemRole>> = CORE_ROLE_TO_SUBSYSTEM_ROLE;
  return table[role] ?? null;
}
