/**
 * โค้ดพร้อมเลขบรรทัด — ใช้ทั้งแผงโค้ดระหว่างรบและ "โปรแกรมของคู่ดวล" บนหน้าผล
 * UI กลาง (token + font-mono ของ Tailwind) · ไฟล์เบา import แบบ static จากหน้าได้
 */
import type { Ref } from 'react';

/** ตัดบรรทัดว่างท้ายไฟล์ออกเหมือน parser จะได้ไม่มีบรรทัดเปล่าห้อยอยู่ */
export function codeLines(source: string): string[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

interface Props {
  lines: string[];
  /** index (0-based) ของบรรทัดที่ไฮไลต์ · -1 = ไม่มี */
  activeIndex?: number;
  /** true = บรรทัดที่ไฮไลต์เป็นของเทิร์นก่อน (ตอนนี้ตาของศัตรู) — หรี่ลง */
  activePast?: boolean;
  activeRef?: Ref<HTMLLIElement>;
  label: string;
}

export default function CodeListing({ lines, activeIndex = -1, activePast = false, activeRef, label }: Props) {
  return (
    <ol aria-label={label} className="min-w-max py-2 font-mono text-label-md font-normal">
      {lines.map((text, i) => {
        const isActive = i === activeIndex;
        const tone = isActive
          ? activePast
            ? 'border-outline bg-surface-container-low'
            : 'border-primary-container bg-primary-container/10'
          : 'border-transparent';
        return (
          <li
            key={i}
            ref={isActive ? activeRef : undefined}
            aria-current={isActive && !activePast ? 'step' : undefined}
            className={`flex gap-4 border-l-4 pr-4 pl-3 leading-6 ${tone}`}
          >
            <span className="w-6 shrink-0 text-right text-outline tabular-nums select-none">
              {i + 1}
            </span>
            <code className={`whitespace-pre ${isActive && !activePast ? 'text-primary-container' : 'text-on-surface'}`}>
              {text === '' ? ' ' : text}
            </code>
            {isActive && <span className="sr-only">{activePast ? '(เทิร์นล่าสุดของคุณ)' : '(กำลังทำงาน)'}</span>}
          </li>
        );
      })}
    </ol>
  );
}
