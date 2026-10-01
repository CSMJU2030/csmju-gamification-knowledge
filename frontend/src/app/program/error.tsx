'use client';

import { ErrorState } from '@/components/feedback';

/**
 * ข้อผิดพลาดที่หลุดจากหน้า /program — ส่วนใหญ่คือโหลด chunk ของเอดิเตอร์ไม่สำเร็จ (เน็ตหลุดกลางทาง)
 * ไม่แสดง error.message ดิบตามมาตรฐานข้อ 16.1.1 · Next 15 ส่งฟังก์ชันลองใหม่มาเป็น `reset`
 */
export default function ProgramError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
