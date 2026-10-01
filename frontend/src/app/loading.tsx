import { LoadingRegion, Skeleton } from '@/components/feedback';

/** โครงหน้าระหว่างโหลด route — Skeleton ไม่ใช่ spinner กลางจอ (ข้อ 9.2) */
export default function Loading() {
  return (
    <LoadingRegion>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </LoadingRegion>
  );
}
