'use client';

/**
 * การดวลหลังจบรอบในภูมิภาค (รอบ 2W §5) — ส่วนที่ไม่ใช่เวที: แนะนำคู่ดวล และผลการดวล
 * ย้ายเนื้อหาจาก client/src/pages/DuelScreen.tsx · คัตอินแบบเกมเดิมกลายเป็นการ์ดมาตรฐาน
 *
 * ย้ำสิ่งที่ §5.3 แก้สเปกตัวเองไว้: การดวลเป็น **แมตช์แยก เลือดเต็มทั้งคู่**
 * เล่นหลังจบรอบ ไม่มีดรอป ไม่มี EXP และไม่แตะผลของรอบนั้นเลย — จึงไม่มีช่องรางวัล
 */
import type { ReactNode, Ref } from 'react';
import { useId, useMemo, useState } from 'react';
import type { ClassId } from '@tower/engine/types';
import { ChevronRightIcon, CodeIcon, StatusBadge, cardClass, secondaryButtonClass } from '@/csmju';
import { Alert } from '@/components/feedback';
import type { DuelBlock, RegionRun } from '@/lib/api/types';
import { CLASS_NAMES } from '@/lib/game/labels';
import CodeListing, { codeLines } from '@/game-stage/battle/CodeListing';

type Opponent = DuelBlock['opponent'];
type Announced = NonNullable<RegionRun['duel']>;

export function classLabel(classId: string): string {
  return CLASS_NAMES[classId as ClassId] ?? classId;
}

/**
 * §8.4: คู่ที่ผลการรบคืนมาอาจไม่ใช่คู่ที่ประกาศตอนกดเข้า เพราะเซิร์ฟเวอร์จับคู่ผู้เล่นสองคนแบบสองทาง
 * คนที่กดเข้าโซนว่างก่อนจึงถูก "อัปเกรด" จากสแนปช็อต/ไม่มีคู่ เป็นคนจริงหลังเห็นคำประกาศไปแล้ว
 * — เป็นข่าวดี ไม่ใช่ข้อผิดพลาด จึงพูดแบบนั้น
 */
export function upgradedOpponent(opp: Opponent, announced: Announced | null | undefined): boolean {
  const a = announced ?? null;
  return opp.live && (a === null || !a.live || a.displayName !== opp.displayName);
}

export function DuelIntro({
  duel,
  announced,
  headingRef,
}: {
  duel: DuelBlock;
  announced: Announced | null | undefined;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const headingId = useId();
  const opp = duel.opponent;
  const a = announced ?? null;
  return (
    <section className={`${cardClass} space-y-3 p-4 md:p-6`} aria-labelledby={headingId}>
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-headline-md text-on-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-container"
      >
        การดวลกับ {opp.displayName}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={opp.live ? 'success' : 'neutral'}>
          {opp.live ? 'ผู้เล่นตัวจริง อยู่ในโซนนี้ตอนนี้' : 'สแนปช็อตที่เก็บไว้'}
        </StatusBadge>
        <span className="text-label-md text-on-surface-variant">
          {classLabel(opp.classId)} · เลเวล {opp.level}
        </span>
      </div>
      <p className="text-body-md text-on-surface-variant">
        แมตช์แยก เลือดเต็มทั้งคู่ — ผลการดวลไม่แตะรอบที่เพิ่งเล่นจบ ไม่มีดรอป ไม่มี EXP ตัวตัดสินคือโปรแกรมล้วน ๆ
      </p>
      {upgradedOpponent(opp, a) && (
        <Alert tone="info">
          คู่ดวลเปลี่ยนเป็นผู้เล่นตัวจริงที่อยู่ในโซนเดียวกัน — ตอนกดเข้าโซน
          {a === null ? 'ยังไม่มีใครอยู่ที่นี่' : ` ยังเป็น ${a.displayName} (สแนปช็อต)`} แต่เขาเพิ่งเดินเข้ามา
        </Alert>
      )}
    </section>
  );
}

interface ResultProps {
  duel: DuelBlock;
  headingRef?: Ref<HTMLHeadingElement>;
  actions: ReactNode;
}

export function DuelResult({ duel, headingRef, actions }: ResultProps) {
  const headingId = useId();
  const codeId = useId();
  const opp = duel.opponent;
  // แพ้ = เปิดโค้ดของเขาไว้ให้เลย เพราะนี่คือสิ่งเดียวที่ได้จากการแพ้ครั้งนี้ (§5.4) · ชนะ = พับไว้
  const [showCode, setShowCode] = useState(!duel.won);
  const lines = useMemo(() => codeLines(duel.opponentProgram), [duel.opponentProgram]);
  const hasProgram = duel.opponentProgram.trim() !== '';

  return (
    <section className={`${cardClass} fade-slide-up p-4 md:p-6`} aria-labelledby={headingId}>
      <p className="text-label-md text-on-surface-variant">ผลการดวล</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-headline-md text-on-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-container"
        >
          {duel.won ? 'ชนะการดวล' : 'แพ้การดวล'}
        </h2>
        <StatusBadge tone={duel.won ? 'success' : 'error'}>{duel.rounds} รอบ</StatusBadge>
      </div>
      <p className="mt-1 text-body-md text-on-surface-variant">
        {duel.won ? 'คุณชนะ' : 'คุณแพ้'} {opp.displayName}
        {duel.byTimeout ? ' · ตัดสินด้วยเลือดที่เหลือเมื่อครบรอบ' : ''} — รอบที่เพิ่งเล่นไม่ถูกแตะเลย{' '}
        {duel.won ? 'ชนะที่นี่ไม่มีรางวัล' : 'แพ้ที่นี่ไม่เสียอะไร'}
      </p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          className={secondaryButtonClass}
          aria-expanded={showCode}
          aria-controls={codeId}
          onClick={() => setShowCode((v) => !v)}
        >
          <CodeIcon className="h-4 w-4" />
          {showCode ? `ซ่อนโปรแกรมของ ${opp.displayName}` : `ดูโปรแกรมของ ${opp.displayName}`}
          <ChevronRightIcon className={`h-4 w-4 transition-transform duration-150 motion-reduce:transition-none ${showCode ? 'rotate-90' : ''}`} />
        </button>
        <div id={codeId} hidden={!showCode} className="space-y-3">
          <p className="text-body-md text-on-surface-variant">
            {duel.won
              ? 'อ่านดูว่าเขาสั่งอะไรที่คุณไม่ได้สั่ง — ชนะครั้งนี้ไม่ได้แปลว่าโปรแกรมคุณดีกว่าทุกด้าน'
              : 'นี่คือโค้ดที่ชนะคุณ อ่านมัน แล้วเอาสิ่งที่เขาทำไปใส่โปรแกรมของคุณ'}
          </p>
          {hasProgram ? (
            <div
              tabIndex={0}
              aria-label={`โปรแกรมของ ${opp.displayName}`}
              className="max-h-96 overflow-auto rounded-lg border border-outline-variant/40 focus-visible:outline-2 focus-visible:outline-primary-container"
            >
              <CodeListing lines={lines} label={`โปรแกรมของ ${opp.displayName}`} />
            </div>
          ) : (
            <p className="text-body-md text-on-surface-variant">คู่ดวลคนนี้ยังไม่มีโปรแกรม — ตัวละครของเขาใช้การกระทำพื้นฐานของระบบ</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">{actions}</div>
    </section>
  );
}
