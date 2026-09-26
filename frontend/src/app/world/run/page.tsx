'use client';

/**
 * /world/run — คำประกาศรอบ: มาหน้านี้เพื่อตัดสินใจว่าจะสู้รอบนี้ไหม (G0 ข้อ 3)
 * ย้ายจาก AnnouncePanel ใน client/src/pages/WorldMapPage.tsx (เดิมเป็นม่านทับแผนที่)
 *
 * รอบมาจาก run-store ที่หน้า /world ใส่ไว้หลัง POST /region-runs — ไม่มีรอบ (รีเฟรช/เปิดลิงก์ตรง)
 * = ไม่มีอะไรให้ประกาศ จึงพากลับแผนที่ แทนที่จะเดาหรือสร้างรอบใหม่เอง
 *
 * ออกจากหน้าโดยไม่รบ = ออกจากโซน (DELETE /region-runs/:id) ตามตรรกะ leave() ของเดิม
 * ไม่งั้นคนอื่นจะเห็น playersHere นับเราค้างอยู่ และอาจถูกจับเป็นคู่ดวล "ออนไลน์" ทั้งที่ไปแล้ว
 * จนกว่าอายุรอบ 5 นาทีจะหมด · ยกเว้นตอนรบสำเร็จแล้วกำลังไป /battle — ตอนนั้นยังอยู่ในโซนจริง
 */
import dynamic from 'next/dynamic';
import Link from '@/components/AppLink';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClassId } from '@tower/engine/types';
import {
  AlertIcon,
  CheckIcon,
  InfoIcon,
  Modal,
  PageHeader,
  PersonIcon,
  StatusBadge,
  SwordsIcon,
  cardClass,
  primaryButtonClass,
} from '@/csmju';
import { Alert, Button, EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { ApiError, api, userMessage } from '@/lib/api/client';
import type { BattleOutcome, Character } from '@/lib/api/types';
import { setPendingBattle } from '@/lib/game/battle-store';
import { CLASS_NAMES } from '@/lib/game/labels';
import { useGame } from '@/lib/game/session';
import RunCountdown from '@/game-stage/world/RunCountdown';
import RunSkeleton, { RUN_GRID } from '@/game-stage/world/RunSkeleton';
import { WAVES_PER_RUN, errorStateMessage } from '@/game-stage/world/logic';
import { clearRegionRun, useRegionRun, type StoredRegionRun } from '@/game-stage/world/run-store';

/** portrait อ่าน sprites.json (~140KB) — โหลดแยก chunk เฉพาะตอนมีคู่ดวล ไม่ให้เข้า JS แรกเข้า (กฎข้อ 11) */
const DuelPortrait = dynamic(() => import('@/game-stage/world/DuelPortrait'), {
  ssr: false,
  loading: () => <Skeleton className="h-12 w-12 shrink-0 rounded-full" />,
});

/**
 * ตัวจับเวลาของการ "ออกจากโซน" ตอนถอดหน้า — หน่วงไว้หนึ่งจังหวะแล้วยกเลิกได้
 * เพราะ StrictMode ของ dev ถอดแล้วต่อคอมโพเนนต์ใหม่ทันทีหนึ่งรอบ ถ้าลบทันทีรอบจะหายตั้งแต่เปิดหน้า
 */
const pendingLeave = new Map<string, ReturnType<typeof setTimeout>>();

type Phase = 'idle' | 'starting' | 'leaving';

function RunHeader({ stored }: { stored?: StoredRegionRun }) {
  if (!stored) return <PageHeader title="คำประกาศรอบ" description="ดูให้ครบก่อนว่ารอบนี้จะเจออะไร แล้วตัดสินใจว่าจะสู้ไหม" />;
  return (
    <PageHeader
      title={`${stored.regionName} · รอบที่ ${stored.run.depth}`}
      description="ดูให้ครบก่อนว่ารอบนี้จะเจออะไร แล้วตัดสินใจว่าจะสู้ไหม"
      aside={<StatusBadge tone="info">ความยาก {stored.run.floor}</StatusBadge>}
    />
  );
}

export default function WorldRunPage() {
  const router = useRouter();
  const stored = useRegionRun();
  const { character, reloadCharacter } = useGame();

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  /** ข้อความว่าทำไมรอบนี้ใช้ไม่ได้แล้ว (409/404/หมดเวลา) — null = ยังใช้ได้ */
  const [gone, setGone] = useState<string | null>(null);
  const [goneOpen, setGoneOpen] = useState(false);

  /** รบสำเร็จ / กดออกเอง / รอบใช้ไม่ได้แล้ว → ตอนถอดหน้าไม่ต้องลบรอบซ้ำ */
  const settledRef = useRef(false);
  /** กำลังรอผล POST /battles — ห้ามลบรอบระหว่างนี้ ไม่งั้นรบสำเร็จแต่ผู้เล่นถูกเตะออกจากโซน */
  const busyRef = useRef(false);
  const mountedRef = useRef(false);

  const runId = stored?.run.id;

  useEffect(() => {
    if (!stored) router.replace('/world');
  }, [stored, router]);

  useEffect(() => {
    if (!runId) return;
    mountedRef.current = true;
    const pending = pendingLeave.get(runId);
    if (pending !== undefined) {
      clearTimeout(pending);
      pendingLeave.delete(runId);
    }

    let leftOnHide = false;
    const onHide = () => {
      if (settledRef.current || busyRef.current) return;
      leftOnHide = true;
      // keepalive: ปิดแท็บแล้วคำขอยังต้องวิ่งต่อจนถึงเซิร์ฟเวอร์
      void api.delete(`/region-runs/${runId}`, { keepalive: true }).catch(() => {});
    };
    const onShow = (e: PageTransitionEvent) => {
      // กลับมาจาก back-forward cache หลังออกไปแล้ว — รอบถูกลบไปตอน pagehide จึงใช้ต่อไม่ได้
      if (!e.persisted || !leftOnHide) return;
      settledRef.current = true;
      setGone('ออกจากหน้านี้ไปแล้ว รอบนี้จึงถูกยกเลิก');
      setGoneOpen(true);
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      pendingLeave.set(
        runId,
        setTimeout(() => {
          pendingLeave.delete(runId);
          if (!settledRef.current && !busyRef.current && !leftOnHide) {
            void api.delete(`/region-runs/${runId}`).catch(() => {});
          }
          clearRegionRun(runId);
        }, 0),
      );
    };
  }, [runId]);

  const markGone = useCallback((message: string) => {
    settledRef.current = true;
    setGone(message);
    setGoneOpen(true);
  }, []);

  const onExpire = useCallback(() => {
    if (settledRef.current || busyRef.current) return;
    markGone('หมดเวลาของรอบนี้แล้ว');
  }, [markGone]);

  const restartHref = stored ? `/world?region=${encodeURIComponent(stored.run.regionId)}` : '/world';

  const restart = useCallback(() => {
    settledRef.current = true;
    router.push(restartHref);
  }, [router, restartHref]);

  const start = useCallback(
    async (before: Character) => {
      if (!stored || phase !== 'idle' || gone) return;
      setPhase('starting');
      setError(null);
      busyRef.current = true;
      try {
        const outcome = await api.post<BattleOutcome>('/battles', { regionRunId: stored.run.id });
        settledRef.current = true;
        setPendingBattle({ kind: 'region', run: stored.run, regionName: stored.regionName, outcome, before });
        // ผู้เล่นกดไปหน้าอื่นระหว่างรอผลแล้ว — ผลถูกบันทึกและเก็บไว้ให้ /battle แล้ว แต่ไม่ดึงเขากลับมา
        if (mountedRef.current) router.push('/battle');
      } catch (e) {
        busyRef.current = false;
        if (e instanceof ApiError && e.code === 'UNAUTHORIZED') return;
        setPhase('idle');
        if (e instanceof ApiError && (e.code === 'CONFLICT' || e.code === 'NOT_FOUND')) {
          markGone(e.message);
          return;
        }
        setError(userMessage(e));
      }
    },
    [stored, phase, gone, router, markGone],
  );

  const leave = useCallback(async () => {
    if (!stored || phase !== 'idle') return;
    setPhase('leaving');
    settledRef.current = true;
    try {
      await api.delete(`/region-runs/${stored.run.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') return;
      // 404 = หมดอายุ/ถูกแทนไปแล้ว ก็คือออกจากโซนแล้ว · เน็ตหลุด = แถวหมดอายุเองใน 5 นาที — ไม่ขังผู้เล่นไว้
    }
    router.push(restartHref);
  }, [stored, phase, router, restartHref]);

  if (!stored) {
    return (
      <>
        <RunHeader />
        <RunSkeleton label="กำลังพากลับแผนที่โลก" />
      </>
    );
  }
  if (character.status === 'loading') {
    return (
      <>
        <RunHeader stored={stored} />
        <RunSkeleton />
      </>
    );
  }
  if (character.status === 'error') {
    return (
      <>
        <RunHeader stored={stored} />
        <ErrorState message={errorStateMessage(character.error)} onRetry={reloadCharacter} />
      </>
    );
  }
  if (character.status === 'none') {
    return (
      <>
        <RunHeader />
        <EmptyState
          icon={<PersonIcon className="h-6 w-6" />}
          title="ยังไม่มีตัวละคร"
          description="สร้างตัวละครก่อน แล้วค่อยเลือกโซนที่จะลงรบจากแผนที่โลก"
          action={
            <Link href="/" className={primaryButtonClass}>
              ไปสร้างตัวละคร
            </Link>
          }
        />
      </>
    );
  }

  const me = character.character;
  const { run } = stored;

  return (
    <>
      <RunHeader stored={stored} />
      <div className={RUN_GRID}>
        <Announcement stored={stored} me={me} />

        <section aria-labelledby="run-decide-title" className={`${cardClass} space-y-5 p-4 md:p-6 xl:sticky xl:top-24`}>
          <h2 id="run-decide-title" className="font-display text-headline-md text-on-surface">
            พร้อมลงสนามไหม
          </h2>

          {!gone && <RunCountdown expiresAt={run.expiresAt} receivedAt={stored.receivedAt} onExpire={onExpire} />}

          {error && <Alert tone="error">{error}</Alert>}
          {/* รอบใช้ไม่ได้แล้ว: Alert นี้คือเหตุผลของปุ่ม "เริ่มรบ" ที่ถูก disable และมีทางไปต่อในตัว */}
          {gone && (
            <div id="run-gone-reason">
              <Alert
                tone="error"
                action={
                  <button type="button" className={primaryButtonClass} onClick={restart}>
                    เริ่มรอบใหม่
                  </button>
                }
              >
                {gone}
              </Alert>
            </div>
          )}

          <div className="space-y-3">
            <Button
              variant="primary"
              className="w-full"
              loading={phase === 'starting'}
              disabled={phase !== 'idle' || gone !== null}
              aria-describedby={gone ? 'run-gone-reason' : undefined}
              onClick={() => void start(me)}
            >
              <SwordsIcon className="h-4 w-4" />
              เริ่มรบ
            </Button>
            {/* รอบใช้ไม่ได้แล้วไม่มีอะไรให้ "ออก" — ทางเดียวที่เหลือคือ "เริ่มรอบใหม่" ใน Alert ข้างบน */}
            {!gone && (
              <Button
                variant="secondary"
                className="w-full"
                loading={phase === 'leaving'}
                disabled={phase !== 'idle'}
                onClick={() => void leave()}
              >
                ออกจากโซน
              </Button>
            )}
          </div>
          <p className="text-label-md font-normal text-on-surface-variant">
            ผลการรบคิดที่เซิร์ฟเวอร์ครั้งเดียวตอนกดเริ่ม หน้าถัดไปคือการเล่นย้อนให้ดูทีละเทิร์น
          </p>
        </section>
      </div>

      <Modal
        open={goneOpen}
        title="รอบนี้ใช้ไม่ได้แล้ว"
        onClose={() => setGoneOpen(false)}
        footer={
          <button type="button" className={primaryButtonClass} onClick={restart}>
            เริ่มรอบใหม่
          </button>
        }
      >
        <p>{gone}</p>
        <p className="mt-2">เข้าโซนใหม่อีกครั้งเพื่อรับคำประกาศของรอบใหม่</p>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- สิ่งที่จะเจอในรอบนี้

function AnnounceRow({
  media,
  title,
  badge,
  children,
}: {
  media: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      {media}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-body-md font-semibold text-on-surface">{title}</h3>
          {badge}
        </div>
        <div className="text-body-md text-on-surface-variant">{children}</div>
      </div>
    </li>
  );
}

function IconDisc({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container text-primary-container">
      {children}
    </span>
  );
}

/**
 * สามเรื่องที่เกมสัญญาว่าจะบอกก่อนรบเสมอ: มอน EX (เวฟไหน) · คู่ดวล · การปรับเลเวล
 * บอกทั้งตอน "มี" และ "ไม่มี" — ถ้าเงียบตอนไม่มี ผู้เล่นจะไม่แน่ใจว่าไม่มีจริงหรือจอยังโหลดไม่เสร็จ
 */
function Announcement({ stored, me }: { stored: StoredRegionRun; me: Character }) {
  const { run } = stored;
  const duel = run.duel ?? null;
  const elite = run.elite ?? null;
  const sync = run.sync ?? null;
  const fightLevel = sync ? sync.level : me.level;

  return (
    <section aria-labelledby="run-announce-title" className={`${cardClass} min-w-0 space-y-6 p-4 md:p-6`}>
      <h2 id="run-announce-title" className="font-display text-headline-md text-on-surface">
        สิ่งที่จะเจอในรอบนี้
      </h2>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { k: 'ความยาก', v: run.floor },
          { k: 'จำนวนเวฟ', v: WAVES_PER_RUN },
          { k: 'เลเวลที่ใช้สู้', v: fightLevel },
        ].map((f) => (
          <div key={f.k} className="rounded-lg bg-surface-container-low px-3 py-3">
            <dt className="text-label-md font-normal text-on-surface-variant">{f.k}</dt>
            <dd className="font-display text-headline-md text-on-surface tabular-nums">{f.v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1">
        <h3 className="text-label-md text-on-surface">บทเรียนของโซนนี้</h3>
        <p className="text-body-md text-on-surface-variant">{run.lessonTh}</p>
      </div>

      <ul className="divide-y divide-outline-variant/40 border-t border-outline-variant/40 pt-4">
        <AnnounceRow
          media={
            <IconDisc>
              {elite ? <AlertIcon className="h-6 w-6" /> : <CheckIcon className="h-6 w-6" />}
            </IconDisc>
          }
          title={elite ? `มอน EX: ${elite.nameTh}` : 'รอบนี้ไม่มีมอน EX'}
          badge={elite ? <StatusBadge tone="warning">เวฟที่ {elite.wave}</StatusBadge> : undefined}
        >
          {elite
            ? `โผล่ที่เวฟ ${elite.wave} จาก ${WAVES_PER_RUN} — รู้ตั้งแต่ตอนนี้ ไม่มีดักกลางทาง และดรอปดีกว่ามอนปกติมาก`
            : `เวฟทั้ง ${WAVES_PER_RUN} เป็นมอนปกติของโซนนี้`}
        </AnnounceRow>

        <AnnounceRow
          media={
            duel ? (
              <DuelPortrait
                classId={duel.classId}
                size={48}
                alt={`ภาพตัวละครอาชีพ${CLASS_NAMES[duel.classId as ClassId] ?? duel.classId}`}
              />
            ) : (
              <IconDisc>
                <SwordsIcon className="h-6 w-6" />
              </IconDisc>
            )
          }
          title={duel ? `คู่ดวล: ${duel.displayName}` : 'รอบนี้ไม่มีคู่ดวล'}
          badge={
            duel ? (
              <StatusBadge tone={duel.live ? 'success' : 'neutral'}>{duel.live ? 'ออนไลน์อยู่' : 'สแนปช็อต'}</StatusBadge>
            ) : undefined
          }
        >
          {duel ? (
            <>
              <p className="text-on-surface">
                {CLASS_NAMES[duel.classId as ClassId] ?? duel.classId} · เลเวล {duel.level}
              </p>
              <p>
                {duel.live ? 'เขาอยู่ในโซนนี้ตอนนี้' : 'ใช้โปรแกรมที่เขาบันทึกไว้ล่าสุด'} · ดวลกันหลังจบรอบ
                เป็นแมตช์แยก เลือดเต็มทั้งคู่ ไม่แตะผลของรอบนี้
              </p>
            </>
          ) : (
            'ยังไม่มีใครในช่วงเลเวลเดียวกันให้จับคู่ — ไม่ใช่เรื่องผิดปกติ'
          )}
        </AnnounceRow>

        {sync && (
          <AnnounceRow
            media={
              <IconDisc>
                <InfoIcon className="h-6 w-6" />
              </IconDisc>
            }
            title={sync.applies ? `รอบนี้ปรับเลเวลเป็น ${sync.level} จาก ${sync.realLevel}` : 'รอบนี้ไม่ปรับเลเวล'}
            badge={sync.applies ? <StatusBadge tone="info">ล็อกเลเวล</StatusBadge> : undefined}
          >
            {sync.applies
              ? `สเตตัสและรางวัลคิดตามเลเวล ${sync.level} ให้พอดีกับความยากของโซน — เลเวลจริงของคุณไม่เปลี่ยน`
              : `เลเวลของคุณ (${sync.realLevel}) ไม่เกินเพดานของความยากนี้ จึงสู้ด้วยค่าจริง`}
          </AnnounceRow>
        )}
      </ul>
    </section>
  );
}
