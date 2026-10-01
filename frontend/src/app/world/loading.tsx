import { PageHeader } from '@/csmju';
import WorldSkeleton from '@/game-stage/world/WorldSkeleton';

/** skeleton ระดับ route (ui-design-system ข้อ 16.1.1) — ขนาดเท่าแผนที่ + การ์ดโซน + รายการจริง */
export default function WorldLoading() {
  return (
    <>
      <PageHeader title="แผนที่โลก" description="เลือกโซนและรอบที่จะลง แล้วดูก่อนว่ารอบนั้นจะเจออะไร" />
      <WorldSkeleton />
    </>
  );
}
