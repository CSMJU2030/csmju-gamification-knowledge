'use client';

/**
 * /battle — เวทีรบ: ดูโค้ดของเราทำงานทีละเทิร์น แล้วรู้ว่าแพ้/ชนะเพราะอะไร (G0 ข้อ 3)
 *
 * หน้านี้ไม่ยิง POST /battles เอง (ยกเว้นปุ่มสู้ซ้ำของหอคอยและมอนของโจทย์) — ผลคำนวณครั้งเดียวที่ backend
 * ตอนหน้าที่มา (/tower · /world/run · /challenges/:id) กดเริ่มรบ แล้วส่งมาทาง battle-store ในหน่วยความจำของแท็บ
 * รีเฟรชหน้า = ผลหายจากจอ แต่ของที่ได้อยู่ในกระเป๋าแล้ว และดูย้อนได้ที่ /battles
 *
 * ลำดับของภูมิภาค (รอบ 2W §5.3): การรบ 10 เวฟ → ผลการรบ → (ถ้ามีคู่) การดวลเป็นแมตช์แยก
 * ผลการดวลไม่มีทางไหลกลับไปแตะผลของรอบ หน้านี้จึงแยกเป็นสองช่วง (phase) ชัดเจน
 */
import dynamic from 'next/dynamic';
import Link from '@/components/AppLink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  MapIcon,
  PageHeader,
  RefreshIcon,
  SwordsIcon,
  TowerIcon,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/csmju';
import { Alert, Button, EmptyState } from '@/components/feedback';
import { api, userMessage } from '@/lib/api/client';
import type { BattleOutcome } from '@/lib/api/types';
import { setPendingBattle, usePendingBattle } from '@/lib/game/battle-store';
import type { PendingBattle } from '@/lib/game/battle-store';
import { useGame } from '@/lib/game/session';
import { duelSides } from '@/game-stage/battle/duel';
import { eliteMismatch, eliteMismatchDetail } from '@/game-stage/battle/elite';
import StageSkeleton from '@/game-stage/battle/StageSkeleton';
import { growthSummary } from '@/lib/game/growth';
import BattleResult from './_components/BattleResult';
import { DuelIntro, DuelResult } from './_components/DuelPanels';

/** ตัวเล่นฉาก (renderer + sprites) — แยก chunk โหลดเฉพาะหน้านี้ (G0 ข้อ 8 งบ JS แรกเข้า) */
const BattlePlayer = dynamic(() => import('@/game-stage/battle/BattlePlayer'), {
  ssr: false,
  loading: () => <StageSkeleton />,
});

const PAGE_DESCRIPTION = 'ดูโค้ดของคุณทำงานทีละเทิร์น แล้วดูว่าแพ้หรือชนะเพราะอะไร';

/** เลเวลมอนสเตอร์ = ชั้น × 2 (มิเรอร์ monsterLevelForFloor ของ engine — ไม่ import เพื่อไม่ให้ engine เข้า chunk หน้า) */
const monsterLevel = (floor: number) => floor * 2;

/**
 * ผลที่ส่งตัวละครหลังรบเข้า session ไปแล้ว — ระดับโมดูล ไม่ใช่ ref ของคอมโพเนนต์
 * เพราะออกจากหน้าแล้วกลับมาด้วยผลเดิม (ยังค้างใน battle-store) ต้องไม่ส่งซ้ำ
 */
const appliedOutcomes = new WeakSet<BattleOutcome>();

export default function BattlePage() {
  const pending = usePendingBattle();
  if (!pending) return <NoBattle />;
  // key = id ของบันทึกการรบ → ท้าทายซ้ำได้ผลใหม่ = เริ่มหน้าใหม่ทั้งหมด (ฉาก สถานะปุ่ม โฟกัส)
  return <BattleView key={pending.outcome.id} pending={pending} />;
}

function NoBattle() {
  return (
    <>
      <PageHeader title="เวทีรบ" description={PAGE_DESCRIPTION} />
      <EmptyState
        title="ไม่มีการรบที่กำลังเล่น"
        icon={<SwordsIcon className="h-6 w-6" />}
        description={
          <>
            เลือกชั้นในหอคอยหรือโซนบนแผนที่เพื่อเริ่มรบ — ผลการรบที่ผ่านมาดูย้อนหลังได้ที่หน้าประวัติการรบ
            <span className="mt-1 block">
              <Link
                href="/battles"
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-label-md text-primary-container underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary-container md:min-h-0"
              >
                ดูประวัติการรบ
              </Link>
            </span>
          </>
        }
        action={
          <>
            <Link href="/tower" className={primaryButtonClass}>
              <TowerIcon className="h-4 w-4" />
              ไปหอคอย
            </Link>
            <Link href="/world" className={secondaryButtonClass}>
              <MapIcon className="h-4 w-4" />
              ไปแผนที่โลก
            </Link>
          </>
        }
      />
    </>
  );
}

function BattleView({ pending }: { pending: PendingBattle }) {
  const { gameData, setCharacter } = useGame();
  const { outcome, before } = pending;
  const region = pending.kind === 'region' ? pending : null;
  const challenge = pending.kind === 'challenge' ? pending : null;
  const announce = outcome.announce;
  const floor =
    pending.kind === 'tower' ? pending.floor : pending.kind === 'region' ? (announce?.floor ?? pending.run.floor) : 0;
  const title =
    pending.kind === 'tower'
      ? `หอคอย ชั้น ${floor}`
      : pending.kind === 'region'
        ? `${pending.regionName} รอบที่ ${pending.run.depth} · ความยาก ${floor}`
        : `โจทย์: ${pending.title}`;
  const contextLine =
    pending.kind === 'tower'
      ? `หอคอย ชั้น ${floor}`
      : pending.kind === 'region'
        ? `${pending.regionName} รอบที่ ${pending.run.depth}`
        : `มอนของโจทย์ "${pending.title}"`;
  const enemyLevel = challenge ? challenge.enemyLevel : monsterLevel(floor);
  const mismatch = region !== null && eliteMismatch(region.run, announce);
  const duel = region ? (outcome.duel ?? null) : null;

  // ตัวละครหลังบันทึกผล → session ครั้งเดียว (HUD ระหว่างเล่นใช้ `before` ต่างหาก)
  useEffect(() => {
    if (appliedOutcomes.has(outcome)) return;
    appliedOutcomes.add(outcome);
    setCharacter(outcome.character);
  }, [outcome, setCharacter]);

  const sides = useMemo(
    () => (duel ? duelSides(duel, before.displayName, before.derived.maxHp) : null),
    [duel, before.displayName, before.derived.maxHp],
  );

  const [phase, setPhase] = useState<'battle' | 'duel'>('battle');
  const [battleDone, setBattleDone] = useState(false);
  const [duelDone, setDuelDone] = useState(false);

  // ผลขึ้นเหนือเวที → ย้ายโฟกัสไปหัวข้อผล ให้ผู้ใช้ screen reader รู้ทันทีว่าจบแล้ว (และเลื่อนจอให้เห็น)
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const duelHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const duelIntroRef = useRef<HTMLHeadingElement | null>(null);
  const [focusTo, setFocusTo] = useState<'battle' | 'duel' | 'duelIntro' | null>(null);
  useEffect(() => {
    if (!focusTo) return;
    const ref = focusTo === 'battle' ? resultHeadingRef : focusTo === 'duel' ? duelHeadingRef : duelIntroRef;
    ref.current?.focus();
    setFocusTo(null);
  }, [focusTo]);

  // สลับช่วงรบ ↔ ดวล = เนื้อหาทั้งส่วนเปลี่ยน → พาโฟกัส (และจอ) ไปหัวข้อของช่วงใหม่ ไม่ปล่อยค้างกลางหน้า
  const goPhase = (next: 'battle' | 'duel') => {
    setPhase(next);
    setFocusTo(next === 'battle' ? 'battle' : duelDone || sides === null ? 'duel' : 'duelIntro');
  };

  // playtest รอบ A ข้อ 6: ครั้งแรกที่จุดนี้ต้องดูฉากจนจบ · การ์ดผลบอกว่าโตขึ้นเท่าไร (ก่อน → หลัง)
  const firstAttempt = outcome.attempt?.firstAttempt === true;
  const growth = useMemo(() => growthSummary(before, outcome), [before, outcome]);

  const onBattleFinished = useCallback(() => {
    setBattleDone(true);
    setFocusTo('battle');
  }, []);
  const onDuelFinished = useCallback(() => {
    setDuelDone(true);
    setFocusTo('duel');
  }, []);

  // ---- หอคอย: ท้าทายชั้นเดิมอีกครั้ง ----
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retry = async () => {
    if (pending.kind === 'region') return;
    setRetrying(true);
    setRetryError(null);
    try {
      const next = await api.post<BattleOutcome>(
        '/battles',
        pending.kind === 'tower' ? { towerFloor: pending.floor } : { challengeId: pending.challengeId },
      );
      // ตัวละครหลังรบรอบนี้ = ตัวละคร "ก่อนรบ" ของรอบถัดไป
      setPendingBattle({ ...pending, outcome: next, before: outcome.character });
      window.scrollTo({ top: 0 });
      document.getElementById('main-content')?.focus({ preventScroll: true });
    } catch (e) {
      // 409 (กฎของเกม) → ข้อความจาก backend ตรง ๆ ตาม G0 ข้อ 6
      setRetryError(userMessage(e));
      setRetrying(false);
    }
  };

  const mapHref = region ? `/world?region=${encodeURIComponent(region.run.regionId)}` : '/world';

  const battleActions =
    pending.kind === 'challenge' ? (
      <>
        <Link href={`/challenges/${encodeURIComponent(pending.challengeId)}`} className={secondaryButtonClass}>
          <ArrowLeftIcon className="h-4 w-4" />
          กลับไปหน้าโจทย์
        </Link>
        <Button variant="primary" loading={retrying} onClick={retry}>
          <RefreshIcon className="h-4 w-4" />
          สู้กับมอนของโจทย์อีกครั้ง
        </Button>
      </>
    ) : pending.kind === 'tower' ? (
      <>
        <Link href="/tower" className={secondaryButtonClass}>
          <TowerIcon className="h-4 w-4" />
          กลับหอคอย
        </Link>
        <Button variant="primary" loading={retrying} onClick={retry}>
          <RefreshIcon className="h-4 w-4" />
          ท้าทายชั้น {floor} อีกครั้ง
        </Button>
      </>
    ) : duel ? (
      <>
        <Link href={mapHref} className={secondaryButtonClass}>
          <MapIcon className="h-4 w-4" />
          กลับแผนที่
        </Link>
        <Button variant="primary" onClick={() => goPhase('duel')}>
          <SwordsIcon className="h-4 w-4" />
          ไปดวลกับ {duel.opponent.displayName}
        </Button>
      </>
    ) : (
      <Link href={mapHref} className={primaryButtonClass}>
        <MapIcon className="h-4 w-4" />
        กลับแผนที่
      </Link>
    );

  const reward = outcome.challenge?.reward;
  const challengeNotes = challenge ? (
    outcome.challenge?.ownChallenge ? (
      <Alert tone="info">โจทย์ของคุณเอง — สู้ได้แต่ไม่ได้รางวัล และไม่ขึ้นในตารางผลของผู้เล่น</Alert>
    ) : outcome.challenge?.firstClear && reward ? (
      <Alert tone="success">
        <span className="font-semibold">ชนะมอนของโจทย์ครั้งแรก!</span> ได้ +{reward.exp} EXP และ +{reward.gold} ทอง — รางวัลนี้ได้ครั้งเดียว
      </Alert>
    ) : outcome.result.victory ? (
      <Alert tone="info">ชนะอีกครั้ง — รางวัลของโจทย์ได้เฉพาะตอนชนะครั้งแรก ลองปรับโปรแกรมให้ชนะเร็วขึ้นดูได้</Alert>
    ) : undefined
  ) : undefined;

  const regionNotes =
    region && (announce?.elite || duel) ? (
      <>
        {announce?.elite && (
          <Alert tone="info">
            รอบนี้มีมอน EX — {announce.elite.nameTh} ที่เวฟ {announce.elite.wave}
          </Alert>
        )}
        {duel && (
          <Alert tone="info">
            ยังไม่จบ — การดวลกับ {duel.opponent.displayName} รออยู่ (เลือดเต็มทั้งคู่ ไม่เกี่ยวกับผลข้างบน)
          </Alert>
        )}
      </>
    ) : undefined;

  return (
    <>
      <PageHeader title={title} description={PAGE_DESCRIPTION} />

      {mismatch && region && announce && (
        <Alert tone="error">
          <strong className="font-semibold">ผิดสัญญา: มอน EX ที่ลงสนามไม่ตรงกับที่ประกาศไว้ตอนกดเข้า</strong> —{' '}
          {eliteMismatchDetail(region.run, announce)}
        </Alert>
      )}

      {phase === 'battle' ? (
        <>
          {battleDone && (
            <BattleResult
              outcome={outcome}
              gameData={gameData}
              contextLine={contextLine}
              notes={challenge ? challengeNotes : regionNotes}
              actions={battleActions}
              actionError={retryError}
              headingRef={resultHeadingRef}
              growth={growth}
              {...(region ? { regionName: region.regionName } : {})}
              {...(challenge
                ? {
                    waveTotal: 1,
                    summary: outcome.result.victory
                      ? 'โปรแกรมของคุณชนะมอนของโจทย์'
                      : 'มอนของโจทย์ยังชนะอยู่ ดูบันทึกการรบและโค้ดด้านล่างว่าเทิร์นไหนพลาด',
                    rewards: [
                      ['EXP', reward?.exp ?? 0],
                      ['ทอง', reward?.gold ?? 0],
                    ] as Array<[string, number]>,
                    dropsNote: 'มอนของโจทย์ไม่มีของดรอป — รางวัลได้เฉพาะตอนชนะครั้งแรก',
                  }
                : {})}
            />
          )}
          <BattlePlayer
            events={outcome.result.events}
            character={before}
            gameData={gameData}
            title="ฉากการรบ"
            enemyLevel={enemyLevel}
            {...(challenge ? { waveTotal: 1, enemyLevels: challenge.enemyLevels } : {})}
            startFinished={battleDone}
            onFinished={onBattleFinished}
            canSkip={!firstAttempt}
          />
        </>
      ) : (
        duel && (
          <>
            {(duelDone || sides === null) && (
              <DuelResult
                duel={duel}
                headingRef={duelHeadingRef}
                actions={
                  <>
                    <Button variant="secondary" onClick={() => goPhase('battle')}>
                      ดูผลรอบนี้อีกครั้ง
                    </Button>
                    <Link href={mapHref} className={primaryButtonClass}>
                      <MapIcon className="h-4 w-4" />
                      กลับแผนที่
                    </Link>
                  </>
                }
              />
            )}
            <DuelIntro duel={duel} announced={region?.run.duel} headingRef={duelIntroRef} />
            {sides === null ? (
              <Alert tone="error">
                อ่านบันทึกการดวลไม่ออก (ไม่พบตัวละครทั้งสองฝั่ง) จึงเล่นฉากการดวลไม่ได้ — ผลการดวลด้านบนยังถูกต้องตามที่ระบบบันทึกไว้
              </Alert>
            ) : (
              <BattlePlayer
                events={duel.events}
                character={before}
                gameData={gameData}
                title={`ดวลกับ ${duel.opponent.displayName}`}
                subtitle={duel.opponent.live ? 'ผู้เล่นตัวจริง' : 'สแนปช็อต'}
                enemyLevel={duel.opponent.level}
                enemyHeading="คู่ดวล"
                duel={sides}
                startFinished={duelDone}
                onFinished={onDuelFinished}
              />
            )}
          </>
        )
      )}
    </>
  );
}
