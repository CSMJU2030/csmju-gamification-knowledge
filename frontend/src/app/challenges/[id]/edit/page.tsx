'use client';

/** ผู้สอนแก้โจทย์ — ไม่มีสิทธิ์แก้ข้อนี้ → หน้าไม่มีสิทธิ์ (backend ตรวจซ้ำและตอบ 403 เสมอ) */
import Link from '@/components/AppLink';
import { useParams } from 'next/navigation';
import { ArrowLeftIcon, PageHeader, secondaryButtonClass } from '@/csmju';
import { EmptyState, ErrorState, ForbiddenState, LoadingRegion, Skeleton } from '@/components/feedback';
import { api } from '@/lib/api/client';
import type { Challenge } from '@/lib/api/types';
import { useApi } from '@/lib/api/use-api';
import { useCsmjuUser } from '@/csmju';
import { ChallengeForm, useChallengePermissions } from '../../_parts';

export default function EditChallengePage() {
  const { id } = useParams<{ id: string }>();
  const user = useCsmjuUser();
  const item = useApi((signal) => api.get<Challenge>(`/challenges/${id}`, undefined, signal), [id]);
  const perm = useChallengePermissions();

  if (item.status === 'loading' || user.status === 'loading') {
    return (
      <LoadingRegion label="กำลังโหลดโจทย์">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-96 max-w-3xl rounded-xl" />
      </LoadingRegion>
    );
  }
  if (item.status === 'error') {
    if (item.error.code === 'NOT_FOUND' || item.error.code === 'BAD_REQUEST')
      return (
        <EmptyState
          title="ไม่พบโจทย์นี้"
          description="ไม่พบข้อมูลที่คุณกำลังค้นหา อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง"
          action={
            <Link href="/challenges" className={secondaryButtonClass}>
              <ArrowLeftIcon className="h-4 w-4" />
              กลับรายการโจทย์
            </Link>
          }
        />
      );
    if (item.error.code === 'FORBIDDEN') return <ForbiddenState />;
    return <ErrorState message={item.error.message} onRetry={item.reload} />;
  }
  if (!perm.canEdit(item.data)) return <ForbiddenState />;

  return (
    <>
      <PageHeader title="แก้ไขโจทย์" description={item.data.title} />
      <ChallengeForm initial={item.data} />
    </>
  );
}
