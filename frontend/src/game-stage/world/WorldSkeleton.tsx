/**
 * โครงหน้าแผนที่ระหว่างโหลด — ขนาดเท่าของจริง (แผนที่จองอัตราส่วนภาพ · การ์ดโซน · รายการ) กัน CLS
 * ใช้ทั้งใน app/world/loading.tsx และตอนหน้ารอตัวละคร/รายการโซน · กริดต้องตรงกับ WORLD_GRID ของหน้าจริง
 */
import { cardClass } from '@/csmju';
import { LoadingRegion, Skeleton } from '@/components/feedback';

/** กริดของหน้าแผนที่: จอกว้างแผนที่+รายการอยู่ซ้าย การ์ดโซนอยู่ขวา · จอแคบเรียง แผนที่ → การ์ดโซน → รายการ */
export const WORLD_GRID = 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start';
export const WORLD_MAP_CELL = 'min-w-0 xl:col-start-1 xl:row-start-1';
export const WORLD_DETAIL_CELL = 'min-w-0 xl:sticky xl:top-24 xl:col-start-2 xl:row-span-2 xl:row-start-1';
export const WORLD_LIST_CELL = 'min-w-0 xl:col-start-1 xl:row-start-2';

export default function WorldSkeleton({ label = 'กำลังโหลดแผนที่โลก' }: { label?: string }) {
  return (
    <LoadingRegion label={label}>
      <div className={WORLD_GRID}>
        <div className={WORLD_MAP_CELL}>
          <div className={cardClass}>
            <Skeleton className="aspect-[1920/1072] w-full rounded-none" />
            <div className="flex flex-wrap gap-4 border-t border-outline-variant/40 px-4 py-3 md:px-6">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-5 w-20" />
              ))}
            </div>
          </div>
        </div>
        <div className={`${WORLD_DETAIL_CELL} hidden xl:block`}>
          <div className={`${cardClass} space-y-5 p-6`}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-16 w-full" />
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11 w-11" />
              ))}
            </div>
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
        <div className={WORLD_LIST_CELL}>
          <div className={cardClass}>
            <div className="space-y-2 border-b border-outline-variant/40 px-4 py-4 md:px-6">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-5 w-64 max-w-full" />
            </div>
            <div className="divide-y divide-outline-variant/40">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 md:px-6">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-5 w-40 max-w-full" />
                    <Skeleton className="h-4 w-52 max-w-full" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
