/**
 * โครงของเอดิเตอร์ระหว่างโหลด — ขนาดใกล้ของจริง (แถบแท็บ · ถาด · บล็อก 4 แถว · แผงข้าง) กัน layout กระโดด
 *
 * แยกไฟล์จาก BloxEditor เพราะหน้า /program ต้องใช้มันเป็น `loading` ของ next/dynamic
 * ถ้าอยู่ไฟล์เดียวกัน การ import โครงนี้จะลากล่ามทั้งตัวเข้า chunk แรกของหน้าไปด้วย
 */
import { Skeleton } from '@/components/feedback';
import { cardClass } from '@/csmju';

export default function EditorSkeleton() {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]" aria-hidden="true">
      <div className={cardClass}>
        <div className="flex flex-col-reverse gap-3 border-b border-outline-variant/40 px-4 pt-3 sm:flex-row sm:items-end sm:justify-between md:px-5">
          <div className="flex gap-2 pb-3">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
          <div className="flex items-center justify-between gap-3 pb-1 sm:justify-end sm:pb-3">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-11 w-36" />
          </div>
        </div>
        <div className="grid gap-4 p-4 md:p-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="hidden h-16 w-full lg:block" />
            <Skeleton className="hidden h-16 w-full lg:block" />
            <Skeleton className="hidden h-16 w-full lg:block" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="ml-8 h-11 w-64 max-w-[80%]" />
            <Skeleton className="ml-16 h-11 w-56 max-w-[70%]" />
            <Skeleton className="ml-8 h-11 w-24" />
            <Skeleton className="ml-16 h-11 w-60 max-w-[70%]" />
            <Skeleton className="h-5 w-72 max-w-full" />
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <div className={`${cardClass} space-y-3 p-4`}>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className={`${cardClass} space-y-3 p-4`}>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
