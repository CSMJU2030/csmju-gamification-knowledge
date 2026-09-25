'use client';

/**
 * error boundary ราก — ErrorState + ลองอีกครั้ง ไม่แสดง error.message ดิบ (ui-design-system ข้อ 16.1.1)
 * Next 15 ส่งฟังก์ชันลองใหม่มาในชื่อ `reset` (Next 16 เปลี่ยนเป็น `retry`)
 */
import { ErrorState } from '@/components/feedback';

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
