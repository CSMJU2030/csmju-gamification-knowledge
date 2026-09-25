import { LoadingRegion, Skeleton } from '@/components/feedback';
import EditorSkeleton from '@/game-stage/blox/EditorSkeleton';

/** โครงหน้า /program ระหว่างโหลด route — หัวหน้า + เอดิเตอร์ขนาดใกล้ของจริง (ไม่ใช่ spinner) */
export default function ProgramLoading() {
  return (
    <LoadingRegion label="กำลังโหลดโปรแกรม">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full md:h-10" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <EditorSkeleton />
    </LoadingRegion>
  );
}
