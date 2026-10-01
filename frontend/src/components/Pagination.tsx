'use client';

import { ArrowLeftIcon, ChevronRightIcon, secondaryButtonClass } from '@/csmju';
import type { PageMeta } from '@/lib/api/types';

/** แบ่งหน้าแบบก่อนหน้า/ถัดไป (api-conventions ข้อ 5 · ค่าเริ่มต้น 20 ต่อหน้า) */
export function Pagination({ meta, onPage }: { meta: PageMeta | undefined; onPage: (page: number) => void }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav
      aria-label="แบ่งหน้า"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/40 px-6 py-4"
    >
      <span className="text-label-md text-on-surface-variant tabular-nums">
        หน้า {meta.page} จาก {meta.totalPages} · ทั้งหมด {meta.total} รายการ
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <ArrowLeftIcon className="h-4 w-4" />
          ก่อนหน้า
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          ถัดไป
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </span>
    </nav>
  );
}
