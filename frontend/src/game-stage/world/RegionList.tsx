'use client';

/**
 * รายการโซนแบบข้อความ — อยู่คู่กับแผนที่เสมอ (G0 ข้อ 5.2: รายการโซนไม่ใช่เวทีเกม ใช้ของกลาง 100%)
 *
 * บนมือถือแผนที่กว้าง ~330px ป้ายชื่อบนภาพถูกซ่อน รายการนี้จึงเป็นทางหลักของจอแคบ ไม่ใช่ของสำรอง
 * และเป็นทางที่ screen reader อ่านสถานะทุกโซนได้ครบในที่เดียว
 */
import { PersonIcon, StatusBadge, cardClass } from '@/csmju';
import type { Region } from '@/lib/api/types';
import { STATUS_BADGE, progressText, regionStatus } from './logic';

export function regionRowId(regionId: string): string {
  return `region-row-${regionId}`;
}

export default function RegionList({
  regions,
  selectedId,
  onSelect,
}: {
  regions: Region[];
  selectedId: string | null;
  onSelect: (region: Region) => void;
}) {
  return (
    <section aria-labelledby="region-list-title" className={cardClass}>
      <div className="border-b border-outline-variant/40 px-4 py-4 md:px-6">
        <h2 id="region-list-title" className="font-display text-headline-md text-on-surface">
          รายการโซน
        </h2>
        <p className="text-body-md text-on-surface-variant">เลือกโซนเพื่อดูบทเรียนและรอบที่เข้าได้</p>
      </div>
      <ul className="divide-y divide-outline-variant/40">
        {regions.map((r) => {
          const status = regionStatus(r);
          const badge = STATUS_BADGE[status];
          const on = r.id === selectedId;
          const isTown = status === 'town';
          return (
            <li key={r.id}>
              <button
                id={regionRowId(r.id)}
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(r)}
                className={`flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-container md:px-6 ${
                  on ? 'bg-primary-container/10' : 'hover:bg-surface-container-low'
                }`}
              >
                <span
                  className={`h-10 w-1 shrink-0 rounded-full ${on ? 'bg-primary-container' : 'bg-transparent'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-body-md font-semibold text-on-surface">{r.nameTh}</span>
                    {!isTown && (
                      <span className="text-label-md font-normal text-on-surface-variant">
                        ความยาก {r.floorRange[0]}–{r.floorRange[1]}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-label-md font-normal text-on-surface-variant">
                    <span>{progressText(r)}</span>
                    {r.playersHere > 0 && (
                      <span className="inline-flex items-center gap-1 text-primary-container">
                        <PersonIcon className="h-4 w-4" />
                        มีผู้เล่น {r.playersHere} คน
                      </span>
                    )}
                  </span>
                </span>
                <StatusBadge tone={badge.tone} className="shrink-0">
                  {badge.label}
                </StatusBadge>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
