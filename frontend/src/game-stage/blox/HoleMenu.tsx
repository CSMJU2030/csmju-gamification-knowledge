/**
 * เมนูเลือกค่าในช่อง (schema.ts §4) — แตะช่องแล้วเลือกจากรายการ ไม่ใช่ลากนิพจน์
 *
 * เป็น UI กลาง (G0 ข้อ 5.2 "modal") จึงใช้ Modal ของ @/csmju แทนแผ่น detail-popover ของธีมเกมเดิม
 * ได้ focus trap · Esc · คืนโฟกัสกลับช่องที่กด มาพร้อมกัน · บนมือถือ Modal ชิดล่างจอแบบ bottom sheet อยู่แล้ว
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CmpOp, Expr } from '@tower/engine/lang';
import { Modal, inputClass, primaryButtonClass } from '@/csmju';
import { HOLE_TITLE_TH, NUM_PRESETS, holeSections, numExpr } from './holes';
import type { HoleSection, HoleTarget, SkillOption } from './holes';

interface Props {
  hole: HoleTarget;
  locals: string[];
  skills: SkillOption[];
  onPick: (pick: Expr | CmpOp) => void;
  onClose: () => void;
}

/**
 * บนมือถือ เบราว์เซอร์ยิง click สังเคราะห์ตามหลัง touchend และ "เป้าหมาย" ของ click นั้น
 * ถูกคิดหลังจาก DOM เปลี่ยนไปแล้ว — ถ้าเมนูมาขวางอยู่ใต้นิ้วพอดี จะเปิดแล้วปิด/เลือกทันทีในเฟรมเดียว
 * จึงไม่รับคลิกใด ๆ ในช่วงสั้น ๆ หลังเปิด (ของเดิมมีกลไกนี้ เก็บไว้เหมือนเดิม)
 */
const OPEN_GUARD_MS = 180;

export default function HoleMenu({ hole, locals, skills, onPick, onClose }: Props) {
  const sections: HoleSection[] = holeSections(hole, { locals, skills });
  const [draft, setDraft] = useState<string>(hole.kind === 'num' ? hole.text : '');
  const draftNum = Number(draft);
  const draftOk = draft.trim() !== '' && Number.isFinite(draftNum);

  // ใช้ ref ไม่ใช่ state — onClose ต้องคงตัวตลอด ไม่งั้น Modal จะรัน effect ใหม่แล้วย้ายโฟกัสกลับไปตัวแรก
  const ready = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      ready.current = true;
    }, OPEN_GUARD_MS);
    return () => window.clearTimeout(t);
  }, []);

  const close = useCallback(() => {
    if (ready.current) onClose();
  }, [onClose]);

  const pick = (value: Expr | CmpOp) => {
    if (ready.current) onPick(value);
  };

  return (
    <Modal open title={HOLE_TITLE_TH[hole.kind]} onClose={close}>
      <p>
        ค่าตอนนี้{' '}
        <code lang="en" className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-on-surface">
          {hole.text}
        </code>
      </p>

      {hole.kind === 'num' && (
        <div className="mt-4 space-y-3">
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-2 block text-label-md text-on-surface">ตัวเลข</span>
              <input
                type="number"
                inputMode="decimal"
                className={`${inputClass} font-mono`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && draftOk) pick(numExpr(draftNum));
                }}
              />
            </label>
            <button
              type="button"
              className={`${primaryButtonClass} shrink-0`}
              disabled={!draftOk}
              onClick={() => pick(numExpr(draftNum))}
            >
              ใช้ค่านี้
            </button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="ตัวเลขที่ใช้บ่อย">
            {NUM_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-outline-variant px-3 font-mono text-label-md text-on-surface tabular-nums transition-colors duration-150 hover:bg-surface-variant/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container md:min-h-9 md:min-w-9"
                onClick={() => pick(numExpr(n))}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {sections.map((sec) => (
        <section className="mt-5" key={sec.titleTh}>
          <h3 className="mb-2 text-label-md text-on-surface">{sec.titleTh}</h3>
          {sec.options.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {sec.options.map((opt) => {
                const current = opt.code === hole.text;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    aria-current={current || undefined}
                    className={`flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors duration-150 hover:bg-primary-container/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container ${
                      current ? 'border-primary-container bg-primary-container/10' : 'border-outline-variant'
                    }`}
                    onClick={() => pick(opt.pick)}
                  >
                    <span lang="en" className="font-mono text-label-md wrap-anywhere text-primary-container">
                      {opt.code}
                    </span>
                    <span className="text-body-md text-on-surface-variant">{opt.labelTh}</span>
                    {opt.detailTh && <span className="text-label-md text-on-surface-variant">{opt.detailTh}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </Modal>
  );
}
