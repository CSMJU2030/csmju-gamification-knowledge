'use client';

/**
 * ข้อผิดพลาดที่หลุดจากหน้า /battle (เช่นโหลด chunk ของตัวเล่นฉากไม่สำเร็จ) — ErrorState + ลองอีกครั้ง
 * ผลการรบบันทึกที่ backend ไปแล้วตั้งแต่ก่อนมาหน้านี้ จึงบอกผู้ใช้ได้ว่าไม่มีอะไรหาย
 */
import { PageHeader } from '@/csmju';
import { ErrorState } from '@/components/feedback';

export default function BattleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <PageHeader title="เวทีรบ" />
      <ErrorState
        message="เปิดเวทีรบไม่สำเร็จ ผลการรบถูกบันทึกไว้แล้วและดูได้ที่ประวัติการรบ กรุณาลองอีกครั้ง"
        onRetry={reset}
      />
    </>
  );
}
