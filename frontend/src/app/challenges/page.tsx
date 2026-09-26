'use client';

/**
 * โจทย์ — มาหน้านี้เพื่ออ่านโจทย์ที่ผู้สอนตั้ง แล้วเปิดโปรแกรมตั้งต้นไปลองใน /program (G0 ข้อ 3)
 * ผู้เล่น: เห็นอย่างเดียว · ผู้สอน: สร้างได้ แก้/ลบเฉพาะของตัวเอง · ผู้ดูแล: แก้/ลบได้ทุกโจทย์ (G0 ข้อ 4)
 */
import Link from '@/components/AppLink';
import {
  AssignmentIcon,
  ChevronRightIcon,
  EditIcon,
  PageHeader,
  PlusIcon,
  SearchIcon,
  StatusBadge,
  TrashIcon,
  cardClass,
  iconButtonClass,
  iconDangerButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/csmju';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/feedback';
import { Pagination } from '@/components/Pagination';
import { SearchField } from '@/components/SearchField';
import type { Challenge } from '@/lib/api/types';
import { useSearchList } from '@/lib/api/use-search-list';
import { formatDateTime } from '@/lib/game/labels';
import { regionName, useRegionNames } from '@/lib/game/use-region-names';
import { DeleteChallenge, useChallengePermissions } from './_parts';

export default function ChallengesPage() {
  const { list, rows, meta, q, search, setPage, pending, hasAny, shownQuery, status } = useSearchList<Challenge>('/challenges');
  const perm = useChallengePermissions();
  const regions = useRegionNames();

  const nothingYet = hasAny === false && q === '';

  return (
    <>
      <PageHeader
        title="โจทย์"
        description="อ่านโจทย์ที่ผู้สอนตั้ง แล้วเปิดโปรแกรมตั้งต้นไปลองแก้ในหน้าโปรแกรม"
        aside={
          // รายการว่างมีปุ่มสร้างในการ์ดอยู่แล้ว — ปุ่มหลักมีได้ปุ่มเดียวต่อพื้นที่
          perm.canCreate && !nothingYet && (
            <Link href="/challenges/new" className={primaryButtonClass}>
              <PlusIcon className="h-4 w-4" />
              สร้างโจทย์
            </Link>
          )
        }
      />

      {!nothingYet && (
        <SearchField label="ค้นหาโจทย์" placeholder="ชื่อหรือคำอธิบายของโจทย์" value={q} onSearch={search} status={status} />
      )}
      {list.status === 'loading' && (
        <LoadingRegion label="กำลังโหลดโจทย์">
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        </LoadingRegion>
      )}
      {list.status === 'error' && <ErrorState message={list.error.message} onRetry={list.reload} />}
      {list.status === 'ready' && rows.length === 0 && shownQuery !== '' && (
        <EmptyState
          title={`ไม่พบโจทย์ที่มีคำว่า “${shownQuery}”`}
          description="ค้นในชื่อและคำอธิบายของโจทย์ — ลองคำอื่น หรือล้างการค้นหาเพื่อดูโจทย์ทั้งหมด"
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
          title="ยังไม่มีโจทย์จากผู้สอน"
          description={perm.canCreate ? 'สร้างโจทย์แรกให้ผู้เล่นลองเขียนโปรแกรมตามเป้าหมายที่คุณตั้ง' : 'เมื่อผู้สอนตั้งโจทย์ใหม่ โจทย์จะมาอยู่ที่นี่'}
          icon={<AssignmentIcon className="h-6 w-6" />}
          action={
            perm.canCreate && (
              <Link href="/challenges/new" className={primaryButtonClass}>
                <PlusIcon className="h-4 w-4" />
                สร้างโจทย์
              </Link>
            )
          }
        />
      )}
      {list.status === 'ready' && rows.length > 0 && (
        <>
          <ul className="grid gap-6 md:grid-cols-2" aria-busy={pending}>
            {rows.map((c) => {
              const region = c.regionId ? regionName(c.regionId, regions) : null;
              return (
                <li key={c.id} className={`${cardClass} flex flex-col`}>
                  <div className="flex-1 space-y-2 px-6 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      {region && <StatusBadge tone="info">{region}</StatusBadge>}
                      {perm.isMine(c) && <StatusBadge tone="neutral">โจทย์ของคุณ</StatusBadge>}
                    </div>
                    <h2 className="font-display text-headline-md text-on-surface">{c.title}</h2>
                    <p className="line-clamp-3 text-body-md text-on-surface-variant">
                      {c.description || 'ไม่มีคำอธิบาย'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-outline-variant/40 px-6 py-3">
                    <span className="text-caption text-secondary">แก้ล่าสุด {formatDateTime(c.updatedAt)}</span>
                    <span className="flex items-center gap-1">
                      {perm.canEdit(c) && (
                        <Link href={`/challenges/${c.id}/edit`} className={iconButtonClass} aria-label={`แก้ไข ${c.title}`}>
                          <EditIcon />
                        </Link>
                      )}
                      {perm.canDelete(c) && (
                        <DeleteChallenge challenge={c} onDeleted={list.reload} className={iconDangerButtonClass}>
                          <TrashIcon />
                        </DeleteChallenge>
                      )}
                      <Link
                        href={`/challenges/${c.id}`}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-label-md text-primary-container hover:underline focus-visible:outline-2 focus-visible:outline-primary-container md:min-h-0 md:py-1.5"
                      >
                        อ่านโจทย์
                        <ChevronRightIcon className="h-4 w-4" />
                      </Link>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className={cardClass}>
            <Pagination meta={meta} onPage={setPage} />
          </div>
        </>
      )}
    </>
  );
}
