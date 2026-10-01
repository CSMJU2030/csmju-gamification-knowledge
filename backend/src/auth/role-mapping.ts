/**
 * core role → subsystem role (authorization.md 1.1 ข้อ 3)
 *
 * ⬅ แก้ได้เฉพาะค่าในตาราง และต้องตรงกับ role mapping ที่ลงทะเบียนกับ Core Hub (key = role ที่เข้าได้)
 *
 *   student  → PLAYER       เล่นเกม
 *   alumni   → PLAYER       เล่นเกม
 *   staff    → INSTRUCTOR   เล่นได้ + สร้างโจทย์ BloxCode (D4)
 *   lecturer → INSTRUCTOR   อาจารย์ ใช้สิทธิ์ชุดเดียวกับ staff (role ใหม่ใน standards 1.7.0 · ทีมตกลง 1 ต.ค. 2569)
 *   admin    → ADMIN        ทุกอย่าง รวมข้อมูลของทุกคน
 *   guest    → (ไม่มี)      ผู้เยี่ยมชมเข้าระบบนี้ไม่ได้ — ไม่ติ๊กในทะเบียน Core Hub จึงปฏิเสธตั้งแต่ Core Hub
 *                           และถ้า token role guest มาถึงที่นี่ก็ได้ 403 · conformance ใช้เป็น denied_role
 *
 * core role ที่ไม่มีในตาราง = เข้าระบบนี้ไม่ได้ → 403 (ไม่ใช่ 401)
 */
import type { CoreRole } from './auth.types';

export const CORE_ROLE_TO_SUBSYSTEM_ROLE = {
  student: 'PLAYER',
  alumni: 'PLAYER',
  staff: 'INSTRUCTOR',
  lecturer: 'INSTRUCTOR',
  admin: 'ADMIN',
} as const satisfies Partial<Record<CoreRole, string>>;

export type SubsystemRole = (typeof CORE_ROLE_TO_SUBSYSTEM_ROLE)[keyof typeof CORE_ROLE_TO_SUBSYSTEM_ROLE];

export function mapCoreRole(role: CoreRole): SubsystemRole | null {
  const table: Partial<Record<CoreRole, SubsystemRole>> = CORE_ROLE_TO_SUBSYSTEM_ROLE;
  return table[role] ?? null;
}
