/**
 * มุมมองข้อความ — แก้ Python ตรง ๆ พร้อมเลขบรรทัด
 *
 * ไม่ใช้เอดิเตอร์สำเร็จรูป (CodeMirror ฯลฯ) เพราะโปรแกรมยาวไม่เกิน MAX_PROGRAM_LINES
 * และ textarea ให้พฤติกรรมคีย์บอร์ด/IME ของแต่ละเครื่องที่ถูกต้องอยู่แล้วโดยไม่ต้องดูแล
 *
 * textarea ถูกยืดให้สูงเท่าจำนวนบรรทัดพอดี (ไม่มีสกรอลล์แนวตั้งของตัวเอง)
 * ทำไม: ถ้าปล่อยให้ textarea เลื่อนเอง เลขบรรทัดในรางซ้ายต้องวิ่งตามให้ตรงเป๊ะตลอดเวลา
 * ซึ่งพลาดง่ายมาก (เลื่อนด้วยคีย์บอร์ด/IME/การ autofill ไม่ยิง scroll ทุกกรณี)
 * พอไม่มีสกรอลล์ใน ก็ไม่มีอะไรให้ซิงก์ — หน้าเว็บเลื่อนทั้งหน้าแทน ซึ่งถูกต้องบนมือถือด้วย
 *
 * แถบแดงหลังบรรทัดที่ผิดวางเป็นชั้นล่างของ textarea (พื้น textarea โปร่งใส) ด้วยเหตุผลเดียวกัน:
 * ตำแหน่งแนวตั้งคำนวณจากเลขบรรทัดได้ตรง ๆ เพราะ textarea ไม่เลื่อนแนวตั้งเลย
 */
import { useEffect, useRef } from 'react';

/**
 * ต้องตรงกับ leading-[24px] / py-[10px] ด้านล่าง (หน่วย px เป๊ะ ๆ ไม่ใช้ rem)
 * ถ้าผู้ใช้ตั้งขนาดตัวอักษรของเบราว์เซอร์ใหญ่ขึ้น rem จะยืดแต่ค่าคงที่นี้ไม่ยืด แล้วบรรทัดท้ายจะถูกตัด
 */
const LINE_H = 24;
const PAD_Y = 10;

interface Props {
  source: string;
  onChange: (next: string) => void;
  /** บรรทัดที่ขอให้กระโดดไป (ค่าเปลี่ยน = กระโดดอีกครั้ง แม้เป็นบรรทัดเดิม) */
  jump: { line: number; nonce: number } | null;
  /** บรรทัดที่มีข้อผิดพลาด — ทำเลขให้แดงและระบายพื้นบรรทัดจะได้กวาดตาเจอ */
  errorLines: ReadonlySet<number>;
  /** id ของข้อความอธิบายข้อผิดพลาด (aria-describedby) */
  describedBy?: string;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function CodeEditor({ source, onChange, jump, errorLines, describedBy }: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  /** กด Esc แล้ว Tab ถัดไปย้ายโฟกัสออกได้ตามปกติ */
  const escaped = useRef(false);
  /**
   * การกระโดดอ่าน source ล่าสุดผ่าน ref แทนการใส่ source ใน deps
   * ของเดิมผูก [jump, source] ไว้ ผลคือหลังคลิกข้อผิดพลาดครั้งหนึ่ง ทุกตัวอักษรที่พิมพ์
   * จะดึงเคอร์เซอร์กลับไปเลือกทั้งบรรทัดเดิมซ้ำ (แล้วตัวอักษรถัดไปก็ทับบรรทัดนั้นทิ้ง)
   */
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);
  const lines = source.split('\n');
  // บรรทัดสุดท้ายที่ว่างเพราะ source ลงท้ายด้วย \n ไม่ต้องนับเป็นบรรทัดจริง
  const count = lines.length > 1 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  const shown = Math.max(12, count);
  const height = shown * LINE_H + PAD_Y * 2;
  // บรรทัดที่เซิร์ฟเวอร์รายงานเกินความยาวจริง (เช่น "เกิน 60 บรรทัด") ไม่มีที่ให้ระบาย — ข้ามไป
  const bands = [...errorLines].filter((l) => l >= 1 && l <= shown);

  useEffect(() => {
    if (!jump || !areaRef.current) return;
    const area = areaRef.current;
    const all = sourceRef.current.split('\n');
    const target = Math.min(Math.max(jump.line, 1), all.length);
    let offset = 0;
    for (let i = 0; i < target - 1; i++) offset += all[i].length + 1;
    area.focus({ preventScroll: true });
    area.setSelectionRange(offset, offset + all[target - 1].length);
    const top = area.getBoundingClientRect().top + window.scrollY + PAD_Y + (target - 1) * LINE_H;
    window.scrollTo({ top: Math.max(0, top - window.innerHeight / 2), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [jump]);

  return (
    <div className="flex overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest focus-within:border-primary-container focus-within:ring-2 focus-within:ring-primary-container/20">
      <div
        className="w-11 shrink-0 bg-surface-container-low py-[10px] pr-2 text-right font-mono text-[13px] leading-[24px] text-outline tabular-nums select-none"
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={errorLines.has(i + 1) ? 'font-bold text-error' : undefined}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0" aria-hidden="true">
          {bands.map((l) => (
            <div
              key={l}
              className="absolute inset-x-0 border-l-2 border-error bg-error-container/70"
              style={{ top: PAD_Y + (l - 1) * LINE_H, height: LINE_H }}
            />
          ))}
        </div>
        <textarea
          ref={areaRef}
          className="relative block w-full resize-none overflow-x-auto overflow-y-hidden bg-transparent px-3 py-[10px] font-mono text-base leading-[24px] whitespace-pre text-on-surface outline-none md:text-sm"
          style={{ height }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          wrap="off"
          lang="en"
          aria-label="โค้ด Python ของโปรแกรม"
          aria-describedby={describedBy}
          aria-invalid={errorLines.size > 0 || undefined}
          value={source}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Tab ในเอดิเตอร์โค้ดต้องเยื้อง ไม่ใช่ย้ายโฟกัสออกจากช่อง
            // Esc ก่อนแล้วค่อย Tab = ออกจากช่อง (กันกับดักคีย์บอร์ดตาม WCAG 2.1.2)
            if (e.key === 'Escape') {
              escaped.current = true;
              return;
            }
            if (e.key !== 'Tab' || e.shiftKey || escaped.current) {
              escaped.current = false;
              return;
            }
            e.preventDefault();
            const area = e.currentTarget;
            const { selectionStart, selectionEnd, value } = area;
            const next = `${value.slice(0, selectionStart)}    ${value.slice(selectionEnd)}`;
            onChange(next);
            requestAnimationFrame(() => area.setSelectionRange(selectionStart + 4, selectionStart + 4));
          }}
        />
      </div>
    </div>
  );
}
