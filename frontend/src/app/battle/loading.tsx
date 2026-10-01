/**
 * โครงหน้า /battle ระหว่างโหลด route — หัวหน้า + เวทีขนาดเท่าของจริง (ไม่ใช่ spinner · CLS ≤ 0.1)
 */
import { LoadingRegion, Skeleton } from '@/components/feedback';
import StageSkeleton from '@/game-stage/battle/StageSkeleton';

export default function BattleLoading() {
  return (
    <LoadingRegion label="กำลังเตรียมเวทีรบ">
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-56 md:h-10" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <div className="pt-2">
        <StageSkeleton />
      </div>
    </LoadingRegion>
  );
}
