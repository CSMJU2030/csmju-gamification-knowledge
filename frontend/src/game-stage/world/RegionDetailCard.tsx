'use client';

/**
 * การ์ดรายละเอียดโซน (แทน RegionSheet ที่เป็นม่านในของเดิม) — UI ล้วน ใช้ของกลางทั้งหมด (G0 ข้อ 5.2)
 *
 * ปุ่ม "เข้าโซน" ใช้กฎ "มีสิทธิ์แต่ตอนนี้ทำไม่ได้ = disable + เหตุผล" (G0 ข้อ 4)
 * เหตุผลแสดงเป็นตัวหนังสือถาวรข้างปุ่ม ไม่ใช่ tooltip — มือถือไม่มี hover และปุ่มที่ disable โฟกัสไม่ได้
 * จึงต้องอ่านเจอในลำดับปกติของหน้า
 *
 * การ์ดถูก remount ด้วย key ทุกครั้งที่เปลี่ยนโซน รอบที่เลือกจึงเริ่มใหม่จาก defaultDepth เสมอ
 */
import Link from 'next/link';
import { useId, useState, type Ref } from 'react';
import {
  CheckIcon,
  CloseIcon,
  InfoIcon,
  LockIcon,
  StatusBadge,
  cardClass,
  iconButtonClass,
  secondaryButtonClass,
} from '@/csmju';
import { Alert, Button } from '@/components/feedback';
import type { Region } from '@/lib/api/types';
import { pct } from '@/lib/game/labels';
import {
  STATUS_BADGE,
  defaultDepth,
  enterBlockReason,
  floorOfDepth,
  lockedReason,
  regionStatus,
  unlockFloor,
} from './logic';

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container';

export default function RegionDetailCard({
  region,
  headingRef,
  entering,
  error,
  onRetryLoad,
  onEnter,
  onClose,
}: {
  region: Region;
  headingRef: Ref<HTMLHeadingElement>;
  entering: boolean;
  /** ข้อความจาก backend (409 ฯลฯ) — แสดงเป็น Alert บนการ์ด ไม่ใช่ toast เพราะผู้เล่นต้องอ่านแล้วตัดสินใจต่อ */
  error: string | null;
  onRetryLoad: () => void;
  onEnter: (depth: number) => void;
  onClose: () => void;
}) {
  const [depth, setDepth] = useState(() => defaultDepth(region));
  const titleId = useId();
  const reasonId = useId();
  const depthHelpId = useId();

  const status = regionStatus(region);
  const badge = STATUS_BADGE[status];
  const isTown = status === 'town';
  const locked = lockedReason(region);
  const blocked = enterBlockReason(region, depth);
  const progress = region.depths > 0 ? Math.round((region.depthCleared / region.depths) * 100) : 0;

  return (
    <section aria-labelledby={titleId} className={`${cardClass} space-y-5 p-4 md:p-6`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-label-md font-normal text-on-surface-variant">
            {isTown ? 'เมือง' : `ความยาก ${region.floorRange[0]}–${region.floorRange[1]}`}
          </p>
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-headline-md text-on-surface focus:outline-none"
          >
            {region.nameTh}
          </h2>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            {region.playersHere > 0 && (
              <StatusBadge tone="info">มีผู้เล่นในโซน {region.playersHere} คน</StatusBadge>
            )}
          </div>
        </div>
        <button type="button" className={`${iconButtonClass} -mt-1 -mr-2 shrink-0`} aria-label="ปิดรายละเอียดโซน" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {!isTown && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-label-md font-normal text-on-surface-variant">
            <span>ความคืบหน้า</span>
            <span className="text-on-surface">
              ผ่านแล้ว {region.depthCleared}/{region.depths} รอบ
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-container" aria-hidden="true">
            <div className="h-full rounded-full bg-primary-container" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-label-md text-on-surface">บทเรียนของโซนนี้</h3>
        <p className="text-body-md text-on-surface-variant">{region.lessonTh}</p>
      </div>

      {!isTown && (
        <dl className="flex items-baseline justify-between gap-3 rounded-lg bg-surface-container-low px-4 py-3">
          <dt className="text-label-md font-normal text-on-surface-variant">โอกาสเจอมอน EX ต่อรอบ</dt>
          <dd className="text-label-md text-on-surface">{region.eliteChance > 0 ? pct(region.eliteChance) : 'ไม่มี'}</dd>
        </dl>
      )}

      {isTown ? (
        <div className="space-y-3">
          <p className="text-body-md text-on-surface-variant">
            ที่นี่ไม่มีการรบ — แก้โปรแกรมที่หน้า BloxCode แล้วค่อยเลือกโซนที่จะไปต่อ
          </p>
          <Link href="/program" className={`${secondaryButtonClass} w-full`}>
            ไปหน้าโปรแกรม BloxCode
          </Link>
        </div>
      ) : (
        <>
          {!locked && (
            <fieldset className="space-y-2">
              <legend className="text-label-md text-on-surface">เลือกรอบที่จะลง</legend>
              <div className="flex flex-wrap gap-2" aria-describedby={depthHelpId}>
                {Array.from({ length: region.depths }, (_, i) => i + 1).map((d) => {
                  const over = d > region.maxDepthAllowed;
                  const cleared = d <= region.depthCleared;
                  const on = d === depth;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={over || entering}
                      aria-pressed={on}
                      aria-label={`รอบที่ ${d} ความยาก ${floorOfDepth(region, d)}${
                        over ? ' ยังเข้าไม่ได้' : cleared ? ' ผ่านแล้ว' : ''
                      }`}
                      onClick={() => setDepth(d)}
                      className={`relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border px-3 text-label-md transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing} ${
                        on
                          ? 'border-primary-container bg-primary-container/10 text-primary-container'
                          : 'border-outline-variant bg-transparent text-on-surface-variant hover:bg-surface-variant/50'
                      }`}
                    >
                      {d}
                      {over ? (
                        <LockIcon className="h-3.5 w-3.5" />
                      ) : cleared ? (
                        <CheckIcon className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p id={depthHelpId} className="text-label-md font-normal text-on-surface-variant">
                รอบที่ {depth} = ความยาก {floorOfDepth(region, depth)}
                {region.maxDepthAllowed < region.depths && (
                  <>
                    {' · '}
                    <span className="text-on-surface">ตอนนี้เข้าได้ถึงรอบที่ {region.maxDepthAllowed}</span>
                  </>
                )}
              </p>
            </fieldset>
          )}

          {error && (
            <Alert
              tone="error"
              action={
                <button type="button" className={secondaryButtonClass} onClick={onRetryLoad}>
                  โหลดแผนที่ใหม่
                </button>
              }
            >
              {error}
            </Alert>
          )}

          <div className="space-y-2">
            <Button
              variant="primary"
              className="w-full"
              loading={entering}
              disabled={blocked !== null}
              aria-describedby={blocked ? reasonId : undefined}
              onClick={() => onEnter(depth)}
            >
              เข้าโซน
            </Button>
            {blocked && (
              <p id={reasonId} className="flex items-start gap-2 text-body-md text-on-surface-variant">
                <LockIcon className="mt-1 h-4 w-4 shrink-0" />
                <span>
                  {blocked}
                  {locked && (
                    <span className="block text-label-md font-normal">
                      ชนะความยาก {unlockFloor(region)} ที่โซนไหนก็ได้ รวมถึงหอคอย โซนนี้จะปลดล็อกเอง
                    </span>
                  )}
                </span>
              </p>
            )}
            {!blocked && (
              <p className="flex items-start gap-2 text-label-md font-normal text-on-surface-variant">
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                กดแล้วจะเห็นคำประกาศของรอบก่อน — ยังไม่เริ่มรบทันที
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
