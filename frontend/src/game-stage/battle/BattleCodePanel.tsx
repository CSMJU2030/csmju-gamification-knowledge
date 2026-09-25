'use client';

/**
 * แผงโค้ดระหว่างรบ (เฟส 2B-2) — "บรรทัดไหนทำให้เกิดสิ่งที่เพิ่งเกิดขึ้น"
 * (ย้ายจาก client/src/battle/BattleCodePanel.tsx · หน้าตาเปลี่ยนเป็น UI กลาง ตรรกะเดิมทั้งหมด)
 *
 * สัญญาที่ยึด: game-stage/blox/schema.ts §7
 *   - CombatEvent.line = บรรทัดที่ตัดสินใจเทิร์นนั้น · 0/ไม่มี = การกระทำสำรอง
 *   - ไฮไลต์เฉพาะเทิร์นของผู้เล่น (director.markCode คัดให้แล้ว)
 *
 * ทำไมโค้ดมาจาก GET /programs/current ไม่ใช่จากผลการรบ: ผลการรบไม่ได้ส่ง source มาด้วย
 * และระหว่างฉากกำลังเล่น ผู้เล่นแก้โปรแกรมไม่ได้ โปรแกรมที่ดึงมาจึงเป็นตัวเดียวกับที่เซิร์ฟเวอร์เพิ่งใช้รบ
 *
 * ไฟกะพริบของเดิมตัดออก (ต้องใช้ keyframe สีเกม) — ป้าย "ครั้งที่ N" บนหัวแผงบอกว่าเป็นเทิร์นใหม่แทน
 * แม้บรรทัดเดิมจะทำงานซ้ำหลายเทิร์นติดกัน
 */
import { useEffect, useId, useMemo, useRef } from 'react';
import { RefreshIcon, StatusBadge, cardClass, secondaryButtonClass } from '@/csmju';
import type { StatusTone } from '@/csmju';
import { Alert, Skeleton } from '@/components/feedback';
import CodeListing, { codeLines } from './CodeListing';
import type { CodeHighlight } from './director';
import { PANEL_HEIGHT } from './stage-frame';

interface Props {
  /** โปรแกรมของผู้เล่น (null = ยังโหลดไม่เสร็จ) */
  source: string | null;
  loadError: string | null;
  onRetry: () => void;
  code: CodeHighlight | null;
  /**
   * false = การรบนี้ไม่ได้ขับด้วยโปรแกรม (ไม่มี event ไหนของผู้เล่นส่ง line มาเลย)
   * ต้องบอกตรง ๆ ห้ามเดาว่าเป็นการกระทำสำรอง ไม่งั้นจะสอนผิด
   */
  programDriven: boolean;
  finished: boolean;
}

function status(p: Props): { tone: StatusTone; text: string } {
  const { loadError, source, programDriven, code, finished } = p;
  if (loadError) return { tone: 'warning', text: 'โหลดโปรแกรมไม่สำเร็จ' };
  if (source !== null && !programDriven) return { tone: 'warning', text: 'ไม่ได้ขับด้วยโปรแกรม' };
  if (finished && code === null) return { tone: 'neutral', text: 'จบการรบแล้ว' };
  if (code === null) return { tone: 'neutral', text: 'รอเทิร์นของคุณ' };
  const n = `ครั้งที่ ${code.nonce}`;
  if (code.fallback) {
    return code.active
      ? { tone: 'warning', text: `ระบบตีให้ · ${n}` }
      : { tone: 'neutral', text: `เทิร์นก่อน: ระบบตีให้ · ${n}` };
  }
  if (code.line !== undefined) {
    return code.active
      ? { tone: 'info', text: `บรรทัด ${code.line} · ${n}` }
      : { tone: 'neutral', text: `บรรทัด ${code.line} · ตาของศัตรู` };
  }
  return { tone: 'neutral', text: 'รอเทิร์นของคุณ' };
}

export default function BattleCodePanel(props: Props) {
  const { source, loadError, onRetry, code, programDriven } = props;
  const headingId = useId();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);

  const lines = useMemo(() => (source === null ? [] : codeLines(source)), [source]);

  const showFallback = programDriven && code !== null && code.fallback;
  // บรรทัดที่ต้องไฮไลต์จริง ๆ (index แบบ 0-based) — -1 = ไม่ไฮไลต์บรรทัดไหน
  const activeIndex =
    programDriven && code !== null && !code.fallback && code.line !== undefined && code.line >= 1 && code.line <= lines.length
      ? code.line - 1
      : -1;

  // เลื่อนบรรทัดที่ทำงานให้อยู่กลางกรอบ — คำนวณ scrollTop เองแทน scrollIntoView
  // เพราะ scrollIntoView เลื่อน "ทั้งหน้า" ด้วย = เวทีกระโดดหนีจอระหว่างดู
  useEffect(() => {
    const box = bodyRef.current;
    const row = activeRef.current;
    if (!box || !row) return;
    const want = row.offsetTop - box.clientHeight / 2 + row.offsetHeight / 2;
    box.scrollTop = Math.max(0, want);
  }, [code?.nonce, activeIndex]);

  const st = status(props);
  const warnings = code !== null && code.active ? code.warnings : [];

  return (
    <section className={`${cardClass} flex flex-col`} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/40 px-4 py-3 md:px-6">
        <h2 id={headingId} className="font-display text-label-md text-on-surface">
          โค้ดของคุณ
        </h2>
        <StatusBadge tone={st.tone}>{st.text}</StatusBadge>
      </div>

      <div
        ref={bodyRef}
        tabIndex={0}
        aria-label="โค้ดของคุณระหว่างรบ"
        className={`${PANEL_HEIGHT} relative overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-container`}
      >
        {/* ข้อความนี้ค้างไว้ข้ามเทิร์นมอนด้วย (ไม่ผูกกับ code.active) — ถ้าโผล่ ๆ หาย ๆ
            ทุกเทิร์น ผู้เล่นจะอ่านไม่ทัน ทั้งที่นี่คือสัญญาณสอนที่สำคัญที่สุดของหน้านี้
            ติดขอบบนของกล่อง (sticky) เพราะกล่องเลื่อนตามบรรทัดที่ทำงานอยู่ตลอด */}
        {(showFallback || warnings.length > 0) && (
          <div className="sticky top-0 z-10 space-y-2 bg-surface-container-lowest px-4 pt-3 pb-1 md:px-6">
            {showFallback && (
              <Alert tone="info">
                <strong className="font-semibold">เทิร์นล่าสุด: โปรแกรมไม่ได้สั่งอะไร ระบบเลยตีให้เอง</strong> — ไม่มีบรรทัดไหนในโค้ดทำงานเลย
                เงื่อนไขยังไม่ครอบคลุมสถานการณ์นี้ ลองเพิ่ม <code className="font-mono">else:</code> หรือ{' '}
                <code className="font-mono">attack(weakest(enemies))</code> ปิดท้าย <code className="font-mono">turn()</code>
              </Alert>
            )}
            {warnings.length > 0 && (
              <ul className="space-y-1">
                {warnings.map((w, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
                    <StatusBadge tone="warning">คำเตือน</StatusBadge>
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loadError ? (
          <div className="p-4 md:p-6">
            <Alert
              tone="error"
              action={
                <button type="button" onClick={onRetry} className={secondaryButtonClass}>
                  <RefreshIcon className="h-4 w-4" />
                  ลองอีกครั้ง
                </button>
              }
            >
              {loadError} — ฉากรบยังเล่นได้ตามปกติ
            </Alert>
          </div>
        ) : source === null ? (
          <div className="space-y-3 p-4 md:p-6" role="status" aria-busy="true">
            <span className="sr-only">กำลังโหลดโปรแกรม...</span>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : (
          <>
            {!programDriven && (
              <p className="px-4 pt-3 text-body-md text-on-surface-variant md:px-6">
                การรบครั้งนี้ยังไม่ได้ขับด้วยโปรแกรมของคุณ จึงบอกไม่ได้ว่าบรรทัดไหนทำงาน — ลองท้าทายอีกครั้งหลังบันทึกโปรแกรมที่หน้าโปรแกรม
                BloxCode
              </p>
            )}
            <CodeListing
              lines={lines}
              activeIndex={activeIndex}
              activePast={!!code && !code.active}
              activeRef={activeRef}
              label="โปรแกรมของคุณ"
            />
          </>
        )}

      </div>
    </section>
  );
}
