/**
 * โครงของเวทีระหว่างโหลด chunk ของตัวเล่นฉาก — ขนาดเท่าของจริง (การ์ดเวที + บันทึก + แผงโค้ด)
 * ใช้ทั้งใน loading.tsx ของหน้า และเป็น `loading` ของ next/dynamic
 * ไฟล์นี้ import แบบ static ได้ — ห้ามดึง renderer/sprites เข้ามา
 */
import { cardClass } from '@/csmju';
import { Skeleton } from '@/components/feedback';
import { ENEMY_LIST_MIN_HEIGHT, PANEL_HEIGHT, PLAYER_BOX_HEIGHT, STAGE_ASPECT } from './stage-frame';

export default function StageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">กำลังเตรียมเวทีรบ...</span>
      <div className={cardClass} aria-hidden="true">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className={`${STAGE_ASPECT} w-full rounded-none`} />
        <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/40 px-4 py-3 md:px-6">
          <Skeleton className="h-11 w-24 md:h-9" />
          <Skeleton className="h-11 w-24 md:h-9" />
          <Skeleton className="h-11 w-36 md:h-9" />
          <Skeleton className="h-11 w-24 md:h-9" />
        </div>
        <div className="grid items-start gap-4 border-t border-outline-variant/40 p-4 md:grid-cols-5 md:gap-6 md:p-6">
          <Skeleton className={`${PLAYER_BOX_HEIGHT} md:col-span-2`} />
          <div className="space-y-2 md:col-span-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className={ENEMY_LIST_MIN_HEIGHT} />
          </div>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className={cardClass}>
            <div className="border-b border-outline-variant/40 px-4 py-3 md:px-6">
              <Skeleton className="h-5 w-28" />
            </div>
            <div className={`${PANEL_HEIGHT} space-y-3 p-4 md:p-6`}>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
