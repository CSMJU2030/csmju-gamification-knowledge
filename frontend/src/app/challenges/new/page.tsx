'use client';

/** ผู้สอนสร้างโจทย์ — ผู้เล่นไม่เห็นปุ่มมาหน้านี้ ถ้าพิมพ์ URL เองจะเห็นหน้าไม่มีสิทธิ์ */
import { PageHeader, useCsmjuUser } from '@/csmju';
import { ForbiddenState, LoadingRegion, Skeleton } from '@/components/feedback';
import { ChallengeForm, useChallengePermissions } from '../_parts';

export default function NewChallengePage() {
  const user = useCsmjuUser();
  const perm = useChallengePermissions();

  if (user.status === 'loading') {
    return (
      <LoadingRegion>
        <Skeleton className="h-96 max-w-3xl rounded-xl" />
      </LoadingRegion>
    );
  }
  if (!perm.canCreate) return <ForbiddenState />;

  return (
    <>
      <PageHeader title="สร้างโจทย์" description="ตั้งเป้าหมายให้ผู้เล่นเขียนโปรแกรม แล้วให้โปรแกรมตั้งต้นเป็นจุดเริ่ม" />
      <ChallengeForm />
    </>
  );
}
