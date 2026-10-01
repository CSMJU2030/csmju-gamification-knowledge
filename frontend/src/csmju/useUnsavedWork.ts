'use client';

/**
 * หน้าที่มีฟอร์มกรอกค้าง ประกาศว่า "มีงานยังไม่บันทึก" — ระหว่างนี้ถ้า session หมด (401)
 * shell จะแสดงแถบให้ผู้ใช้กดเข้าสู่ระบบเอง แทนการพาออกจากหน้าทับงาน (auth-contract ข้อ 7)
 */
import { useEffect } from 'react';
import { holdUnsavedWork } from './sso';

export function useUnsavedWork(dirty: boolean): void {
  useEffect(() => (dirty ? holdUnsavedWork() : undefined), [dirty]);
}
