'use client';

/**
 * บันทึกการรบแบบข้อความ — คู่กับเวทีเสมอ (G0 ข้อ 5.3) · UI กลาง ใช้ token ทั้งหมด
 *
 * นี่ไม่ใช่ของตกแต่งข้างฉาก: สำหรับผู้ใช้ screen reader และผู้ที่ปิดแอนิเมชัน
 * บันทึกนี้ "คือ" การรบทั้งหมด ข้อความจึงมาจาก battle-log.ts ชุดเดียวกับที่ทดสอบไว้
 */
import { useEffect, useId, useRef } from 'react';
import { cardClass } from '@/csmju';
import type { LogKind } from './battle-log';
import type { LogLine } from './director';
import { PANEL_HEIGHT } from './stage-frame';

/** ชนิดของบรรทัด → จุดนำหน้า (สีเสริมเท่านั้น ความหมายอยู่ในข้อความเสมอ) */
const MARK: Record<LogKind, string> = {
  normal: 'bg-outline-variant',
  wave: 'bg-primary-container',
  kill: 'bg-error',
  heal: 'bg-success',
  system: 'bg-brand-amber',
};

export default function BattleLog({ lines }: { lines: LogLine[] }) {
  const headingId = useId();
  const boxRef = useRef<HTMLDivElement | null>(null);
  // ผู้ใช้เลื่อนขึ้นไปอ่านย้อน = อย่าดึงกลับลงล่างทุกบรรทัดใหม่
  const stickRef = useRef(true);

  const count = lines.length;
  useEffect(() => {
    const el = boxRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <section className={`${cardClass} flex flex-col`} aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/40 px-4 py-3 md:px-6">
        <h2 id={headingId} className="font-display text-label-md text-on-surface">
          บันทึกการรบ
        </h2>
        <span className="text-label-sm text-on-surface-variant tabular-nums">{count} บรรทัด</span>
      </div>
      {/* role=log = aria-live polite อยู่แล้ว ใส่ซ้ำไว้ให้ชัดตามข้อกำหนด · tabIndex ให้เลื่อนด้วยคีย์บอร์ดได้ */}
      <div
        ref={boxRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-labelledby={headingId}
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className={`${PANEL_HEIGHT} overflow-y-auto px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-container md:px-6`}
      >
        {count === 0 ? (
          <p className="text-body-md text-on-surface-variant">การรบกำลังจะเริ่ม</p>
        ) : (
          <ol className="space-y-1">
            {lines.map((line) => (
              <li
                key={line.id}
                className={`flex gap-2 text-body-md text-on-surface ${
                  line.kind === 'wave' ? 'mt-2 font-semibold first:mt-0' : ''
                }`}
              >
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${MARK[line.kind]}`} aria-hidden="true" />
                <span className="min-w-0">{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
