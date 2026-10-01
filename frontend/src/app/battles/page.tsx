'use client';

/**
 * ประวัติการรบ — มาหน้านี้เพื่อย้อนดูว่ารบอะไรไปแล้ว ชนะ/แพ้กี่รอบ (G0 ข้อ 3)
 * เรียงใหม่สุดก่อน (backend เรียงให้) · 20 รายการต่อหน้า
 */
import Link from '@/components/AppLink';
import {
  HistoryIcon,
  PageHeader,
  SearchIcon,
  StatusBadge,
  SwordsIcon,
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
  tdClass,
  thClass,
} from '@/csmju';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/feedback';
import { Pagination } from '@/components/Pagination';
import { SearchField } from '@/components/SearchField';
import type { BattleSummary } from '@/lib/api/types';
import { useSearchList } from '@/lib/api/use-search-list';
import { fmt, formatDateTime } from '@/lib/game/labels';
import { useGame } from '@/lib/game/session';
import { placeLabel, useRegionNames } from '@/lib/game/use-region-names';

function Result({ b }: { b: BattleSummary }) {
  return b.victory ? <StatusBadge tone="success">ชนะ</StatusBadge> : <StatusBadge tone="error">แพ้</StatusBadge>;
}

export default function BattlesPage() {
  const { character } = useGame();
  const { list, rows, meta, q, search, setPage, pending, hasAny, shownQuery, status } = useSearchList<BattleSummary>('/battles');
  const regions = useRegionNames();

  const header = <PageHeader title="ประวัติการรบ" description="ย้อนดูว่ารบอะไรไปแล้ว ชนะหรือแพ้ และได้อะไรกลับมา" />;

  if (character.status === 'none') {
    return (
      <>
        {header}
        <EmptyState
          title="ยังไม่มีตัวละคร"
          description="ตั้งชื่อตัวละครก่อน แล้วประวัติการรบจะเริ่มนับ"
          action={
            <Link href="/" className={primaryButtonClass}>
              ไปสร้างตัวละคร
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      {(hasAny !== false || q !== '') && (
        <SearchField
          label="ค้นหาการรบ"
          placeholder="สถานที่ เช่น หอคอย ป่าเริ่มต้น"
          value={q}
          onSearch={search}
          status={status}
        />
      )}
      {list.status === 'loading' && (
        <LoadingRegion label="กำลังโหลดประวัติการรบ">
          <div className={`${cardClass} divide-y divide-outline-variant/40`}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </LoadingRegion>
      )}
      {list.status === 'error' && <ErrorState message={list.error.message} onRetry={list.reload} />}
      {list.status === 'ready' && rows.length === 0 && shownQuery !== '' && (
        <EmptyState
          title={`ไม่พบการรบที่ “${shownQuery}”`}
          description="ค้นได้ตามชื่อสถานที่ เช่น หอคอย หรือชื่อภูมิภาคบนแผนที่ — ลองคำอื่น หรือล้างการค้นหา"
          icon={<SearchIcon className="h-6 w-6" />}
          action={
            <button type="button" className={secondaryButtonClass} onClick={() => search('')}>
              ล้างการค้นหา
            </button>
          }
        />
      )}
      {list.status === 'ready' && rows.length === 0 && shownQuery === '' && (
        <EmptyState
          title="ยังไม่เคยรบ"
          description="เลือกโซนบนแผนที่โลกหรือชั้นของหอคอย แล้วผลการรบทุกครั้งจะมาอยู่ที่นี่"
          icon={<HistoryIcon className="h-6 w-6" />}
          action={
            <Link href="/world" className={primaryButtonClass}>
              <SwordsIcon className="h-4 w-4" />
              ลงรบ
            </Link>
          }
        />
      )}
      {list.status === 'ready' && rows.length > 0 && (
        <section className={cardClass} aria-labelledby="battles-title" aria-busy={pending}>
          <div className="flex items-end justify-between gap-3 border-b border-outline-variant/40 px-6 py-5">
            <h2 id="battles-title" className="font-display text-headline-md text-on-surface">
              {shownQuery ? 'ผลการค้นหา' : 'การรบทั้งหมด'}
            </h2>
            <span className="text-label-md font-normal text-on-surface-variant tabular-nums">{meta?.total ?? rows.length} ครั้ง</span>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
                  <th scope="col" className={thClass}>เวลา</th>
                  <th scope="col" className={thClass}>ที่</th>
                  <th scope="col" className={thClass}>ผล</th>
                  <th scope="col" className={`${thClass} text-right`}>เวฟ</th>
                  <th scope="col" className={`${thClass} text-right`}>EXP</th>
                  <th scope="col" className={`${thClass} text-right`}>ทอง</th>
                </tr>
              </thead>
              <tbody className="text-body-md">
                {rows.map((b) => (
                  <tr key={b.id} className="border-b border-outline-variant/40 last:border-0 hover:bg-surface/50">
                    <td className={`${tdClass} whitespace-nowrap text-on-surface-variant`}>{formatDateTime(b.createdAt)}</td>
                    <td className={`${tdClass} font-medium text-on-surface`}>{placeLabel(b.regionId, b.floor, b.depth, regions)}</td>
                    <td className={tdClass}>
                      <Result b={b} />
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{b.wavesCleared}/10</td>
                    <td className={`${tdClass} text-right tabular-nums`}>+{fmt(b.expGained)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>+{fmt(b.goldGained)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-outline-variant/40 md:hidden">
            {rows.map((b) => (
              <li key={b.id} className="space-y-1.5 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-body-md font-medium text-on-surface">
                    {placeLabel(b.regionId, b.floor, b.depth, regions)}
                  </span>
                  <Result b={b} />
                </div>
                <div className="flex flex-wrap gap-x-3 text-label-md font-normal text-on-surface-variant tabular-nums">
                  <span>{formatDateTime(b.createdAt)}</span>
                  <span>เวฟ {b.wavesCleared}/10</span>
                  <span>EXP +{fmt(b.expGained)}</span>
                  <span>ทอง +{fmt(b.goldGained)}</span>
                </div>
              </li>
            ))}
          </ul>

          <Pagination meta={meta} onPage={setPage} />
        </section>
      )}
    </>
  );
}
