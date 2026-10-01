/**
 * โครงหน้าคำประกาศรอบระหว่างโหลด — การ์ดสิ่งที่จะเจอ (ซ้าย) + การ์ดตัดสินใจ (ขวา) ขนาดใกล้ของจริง
 * กริดต้องตรงกับ RUN_GRID ของหน้าจริง
 */
import { cardClass } from '@/csmju';
import { LoadingRegion, Skeleton } from '@/components/feedback';

export const RUN_GRID = 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start';

export default function RunSkeleton({ label = 'กำลังโหลดคำประกาศรอบ' }: { label?: string }) {
  return (
    <LoadingRegion label={label}>
      <div className="space-y-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <div className={RUN_GRID}>
        <div className={`${cardClass} min-w-0 space-y-6 p-4 md:p-6`}>
          <Skeleton className="h-7 w-48" />
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-12 w-full" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className={`${cardClass} space-y-4 p-4 md:p-6`}>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-12 w-28" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </LoadingRegion>
  );
}
