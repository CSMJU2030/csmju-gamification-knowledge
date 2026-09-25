'use client';

/** อ่านโจทย์หนึ่งข้อ · 404 → EmptyState + ย้อนกลับ (G0 ข้อ 3) */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  CodeIcon,
  EditIcon,
  PageHeader,
  StatusBadge,
  TrashIcon,
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/csmju';
import { EmptyState, ErrorState, ForbiddenState, LoadingRegion, Skeleton } from '@/components/feedback';
import { api } from '@/lib/api/client';
import type { Challenge } from '@/lib/api/types';
import { useApi } from '@/lib/api/use-api';
import { formatDateTime } from '@/lib/game/labels';
import { regionName, useRegionNames } from '@/lib/game/use-region-names';
import { DeleteChallenge, useChallengePermissions } from '../_parts';

export default function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const item = useApi((signal) => api.get<Challenge>(`/challenges/${id}`, undefined, signal), [id]);
  const perm = useChallengePermissions();
  const regions = useRegionNames();

  const back = (
    <Link href="/challenges" className={secondaryButtonClass}>
      <ArrowLeftIcon className="h-4 w-4" />
      กลับรายการโจทย์
    </Link>
  );

  if (item.status === 'loading') {
    return (
      <LoadingRegion label="กำลังโหลดโจทย์">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 rounded-xl" />
      </LoadingRegion>
    );
  }
  if (item.status === 'error') {
    if (item.error.code === 'NOT_FOUND' || item.error.code === 'BAD_REQUEST')
      return (
        <EmptyState
          title="ไม่พบโจทย์นี้"
          description="ไม่พบข้อมูลที่คุณกำลังค้นหา อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง"
          action={back}
        />
      );
    if (item.error.code === 'FORBIDDEN') return <ForbiddenState />;
    return <ErrorState message={item.error.message} onRetry={item.reload} />;
  }

  const c = item.data;
  const region = c.regionId ? regionName(c.regionId, regions) : null;

  return (
    <>
      <PageHeader
        title={c.title}
        description={`แก้ล่าสุด ${formatDateTime(c.updatedAt)}`}
        aside={
          <>
            {region && <StatusBadge tone="info">ทดสอบที่ {region}</StatusBadge>}
            {perm.isMine(c) && <StatusBadge tone="neutral">โจทย์ของคุณ</StatusBadge>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <section className={`${cardClass} lg:col-span-3`} aria-labelledby="desc-title">
          <h2 id="desc-title" className="border-b border-outline-variant/40 px-6 py-5 font-display text-headline-md text-on-surface">
            โจทย์
          </h2>
          <p className="max-w-prose px-6 py-5 text-body-md whitespace-pre-wrap text-on-surface">
            {c.description || 'ผู้สอนยังไม่ได้เขียนคำอธิบาย'}
          </p>
        </section>

        <section className={`${cardClass} lg:col-span-2`} aria-labelledby="starter-title">
          <h2 id="starter-title" className="border-b border-outline-variant/40 px-6 py-5 font-display text-headline-md text-on-surface">
            โปรแกรมตั้งต้น
          </h2>
          <pre className="overflow-x-auto bg-surface-container-low px-6 py-5 font-mono text-label-md leading-relaxed font-normal text-on-surface">
            {c.starterSource}
          </pre>
          <div className="border-t border-outline-variant/40 px-6 py-4">
            <Link href={`/program?starter=${c.id}`} className={`${primaryButtonClass} w-full`}>
              <CodeIcon className="h-4 w-4" />
              ลองในหน้าโปรแกรม
            </Link>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        {back}
        <span className="flex gap-3">
          {perm.canDelete(c) && (
            <DeleteChallenge challenge={c} onDeleted={() => router.push('/challenges')} className={secondaryButtonClass}>
              <TrashIcon className="h-4 w-4" />
              ลบโจทย์
            </DeleteChallenge>
          )}
          {perm.canEdit(c) && (
            <Link href={`/challenges/${c.id}/edit`} className={secondaryButtonClass}>
              <EditIcon className="h-4 w-4" />
              แก้ไขโจทย์
            </Link>
          )}
        </span>
      </div>
    </>
  );
}
