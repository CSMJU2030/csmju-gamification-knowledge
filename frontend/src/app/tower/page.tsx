'use client';

/**
 * หอคอย — มาหน้านี้เพื่อเลือกชั้นที่จะท้าทาย (G0 ข้อ 3)
 * กดท้าทาย → POST /battles {towerFloor} → ส่งผลไปเล่นที่ /battle (ผลคำนวณและบันทึกที่ backend ครั้งเดียว)
 */
import Link from '@/components/AppLink';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LockIcon, PageHeader, StatusBadge, cardClass, primaryButtonClass, secondaryButtonClass } from '@/csmju';
import { Alert, Button, EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/feedback';
import { api, userMessage } from '@/lib/api/client';
import type { BattleOutcome, TowerProgress } from '@/lib/api/types';
import { useApi } from '@/lib/api/use-api';
import { setPendingBattle } from '@/lib/game/battle-store';
import { useGame } from '@/lib/game/session';

/** ชื่อชั้นของหอคอย — ย้ายจาก TowerPage เดิม (ชื่อเป็นของหน้าจอ backend ไม่ได้ส่งมา) */
const FLOOR_NAMES: Record<number, string> = {
  1: 'ลานสไลม์',
  2: 'ถ้ำก็อบลิน',
  3: 'ป่าหมาป่า',
  4: 'สุสานโบราณ',
  5: 'หอเวทมืด',
  6: 'ค่ายออร์ค',
  7: 'ยอดผาฮาร์ปี้',
  8: 'โถงโกเลม',
  9: 'บัลลังก์ลิช',
  10: 'ยอดหอคอย',
};

/** จำนวนชั้นที่ skeleton จองไว้ = จำนวนชื่อชั้น (เท่า maxFloor ที่ API ตอบ · TOWER_MAX_FLOOR ของ backend) */
const SKELETON_FLOORS = Object.keys(FLOOR_NAMES).length;

/** โครงเท่ารายการจริง (หัวการ์ด + ทุกชั้น · แถวเดียวกันทั้งความสูงและการตัดบรรทัด) — สั้นกว่าจริงแล้ว footer กระโดด (CLS) */
function TowerSkeleton() {
  return (
    <LoadingRegion label="กำลังโหลดหอคอย">
      <div className={cardClass}>
        <div className="flex flex-col gap-1 border-b border-outline-variant/40 px-6 py-5 md:flex-row md:items-end md:justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="divide-y divide-outline-variant/40">
          {Array.from({ length: SKELETON_FLOORS }, (_, i) => (
            <div key={i} className="flex flex-wrap items-center gap-4 px-6 py-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-40 max-w-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </span>
              <Skeleton className="h-11 w-28 md:h-10" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

export default function TowerPage() {
  const router = useRouter();
  const { character } = useGame();
  const progress = useApi((signal) => api.get<TowerProgress>('/tower-progress', undefined, signal));
  const [busyFloor, setBusyFloor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const challenge = async (floor: number) => {
    if (character.status !== 'ready' || busyFloor !== null) return;
    setBusyFloor(floor);
    setError(null);
    try {
      const outcome = await api.post<BattleOutcome>('/battles', { towerFloor: floor });
      setPendingBattle({ kind: 'tower', floor, outcome, before: character.character });
      router.push('/battle');
    } catch (e) {
      setError(userMessage(e));
      setBusyFloor(null);
    }
  };

  const header = <PageHeader title="หอคอย" description="เลือกชั้นหอคอยที่จะท้าทาย ผ่านชั้นหนึ่งแล้วชั้นถัดไปจะเปิด" />;

  if (character.status === 'none') {
    return (
      <>
        {header}
        <EmptyState
          title="ยังไม่มีตัวละคร"
          description="ตั้งชื่อตัวละครก่อน แล้วค่อยกลับมาท้าทายหอคอย"
          action={
            <Link href="/" className={primaryButtonClass}>
              ไปสร้างตัวละคร
            </Link>
          }
        />
      </>
    );
  }

  if (progress.status === 'loading' || character.status === 'loading') {
    return (
      <>
        {header}
        <TowerSkeleton />
      </>
    );
  }

  if (progress.status === 'error') {
    return (
      <>
        {header}
        <ErrorState message={progress.error.message} onRetry={progress.reload} />
      </>
    );
  }

  const { highestFloorCleared: highest, maxFloor, globalHighestFloor } = progress.data;
  const next = highest + 1;
  const floors = Array.from({ length: maxFloor }, (_, i) => maxFloor - i);

  return (
    <>
      {header}
      {error && <Alert>{error}</Alert>}

      <section className={cardClass} aria-labelledby="floors-title">
        <div className="flex flex-col gap-1 border-b border-outline-variant/40 px-6 py-5 md:flex-row md:items-end md:justify-between">
          <h2 id="floors-title" className="font-display text-headline-md text-on-surface">
            ชั้นของหอคอย
          </h2>
          <p className="text-label-md font-normal text-on-surface-variant tabular-nums">
            ผ่านแล้ว {highest}/{maxFloor} ชั้น · ความยากสูงสุดที่ผ่านจากทุกที่ {globalHighestFloor}
          </p>
        </div>
        <ol className="divide-y divide-outline-variant/40">
          {floors.map((floor) => {
            const cleared = floor <= highest;
            const isNext = floor === next;
            const locked = floor > next;
            const reasonId = `floor-${floor}-reason`;
            return (
              <li key={floor} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <span
                  className={`inline-flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg font-display ${
                    isNext ? 'bg-btn-gradient text-on-primary' : 'bg-surface-container text-on-surface'
                  }`}
                  aria-hidden="true"
                >
                  <span className="text-caption">ชั้น</span>
                  <span className="text-body-lg leading-none font-bold tabular-nums">{floor}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-md font-semibold text-on-surface">
                    ชั้น {floor} · {FLOOR_NAMES[floor] ?? `ชั้นที่ ${floor}`}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    {cleared && <StatusBadge tone="success">ผ่านแล้ว</StatusBadge>}
                    {isNext && <StatusBadge tone="info">ท้าทายได้</StatusBadge>}
                    {locked && (
                      <span id={reasonId} className="inline-flex items-center gap-1.5 text-label-md font-normal text-on-surface-variant">
                        <LockIcon className="h-4 w-4" />
                        ต้องผ่านชั้น {floor - 1} ก่อน
                      </span>
                    )}
                  </span>
                </span>
                {isNext ? (
                  <Button
                    variant="primary"
                    loading={busyFloor === floor}
                    disabled={busyFloor !== null}
                    onClick={() => void challenge(floor)}
                  >
                    ท้าทายชั้น {floor}
                  </Button>
                ) : (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={locked || busyFloor !== null}
                    aria-describedby={locked ? reasonId : undefined}
                    onClick={() => void challenge(floor)}
                  >
                    {busyFloor === floor ? 'กำลังเริ่มรบ…' : cleared ? 'ท้าทายซ้ำ' : 'ท้าทาย'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
