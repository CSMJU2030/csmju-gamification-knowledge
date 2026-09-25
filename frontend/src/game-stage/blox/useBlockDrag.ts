/**
 * การลากบล็อกด้วย Pointer Events ตาม schema.ts §5
 * ห้ามใช้ HTML5 drag-and-drop API เด็ดขาด (ใช้ไม่ได้บนมือถือ)
 *
 * ลำดับ: pointerdown (จำจุดเริ่ม) → ขยับเกิน DRAG_THRESHOLD_PX หรือกดค้างครบ LONG_PRESS_MS
 * → เริ่มลากจริง + setPointerCapture → pointermove เลื่อนเงา + ไฮไลต์ช่อง
 * → pointerup หย่อน / pointercancel ยกเลิก
 *
 * ต่ำกว่า threshold = "แตะ" ซึ่งมีความหมายคนละอย่าง (เปิดเมนูค่า / เลือกไว้เพื่อวาง)
 * จึงต้องแยกให้ชัด ไม่งั้นนิ้วที่สั่นนิดเดียวจะกลายเป็นการลากที่ผู้เล่นไม่ได้ตั้งใจ
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { DRAG_THRESHOLD_PX, LONG_PRESS_MS, type DragPayload } from './schema';

/** 'slot' = ช่องแทรกคำสั่ง · 'else' = หัว if ที่รับ else ได้ (schema.ts §3) */
export type DropKind = 'slot' | 'else';

export interface DragView {
  payload: DragPayload;
  /** ข้อความบนเงาที่ลากตามนิ้ว */
  label: string;
  x: number;
  y: number;
  /** คีย์ของเป้าหมายที่จะหย่อน (data-slot / data-else) — null = ปล่อยตรงนี้แล้วไม่เกิดอะไร */
  hoverKey: string | null;
  mode: DropKind;
}

export type StartDrag = (e: ReactPointerEvent, payload: DragPayload, label: string, mode?: DropKind) => void;

interface Options {
  /** กรอบที่มีช่องหย่อนทั้งหมดอยู่ข้างใน */
  containerRef: RefObject<HTMLElement | null>;
  onDrop: (payload: DragPayload, mode: DropKind, key: string) => void;
  /** แตะสั้น ๆ ไม่ใช่การลาก — ส่ง element ที่ถูกแตะไปให้ผู้เรียกตัดสินใจเอง */
  onTap: (payload: DragPayload, target: EventTarget | null) => void;
}

interface Pending {
  pointerId: number;
  startX: number;
  startY: number;
  payload: DragPayload;
  label: string;
  mode: DropKind;
  el: HTMLElement;
  target: EventTarget | null;
  dragging: boolean;
  timer: number | null;
  hoverKey: string | null;
}

/** ระยะไกลสุดที่ยังนับว่า "หย่อนลงช่องนี้" — ช่องบางมาก ถ้าไม่เผื่อระยะนิ้วจะไม่มีวันโดน */
const SNAP_PX = 140;

/**
 * หลังลากจบ เบราว์เซอร์ยิง click ตามมาที่ element ที่ถือ pointer capture อยู่ (ตัวบล็อกในถาดเป็น <button>)
 * click นั้นจะไปกด "เลือกไว้รอวาง" ซ้ำทั้งที่เพิ่งวางเสร็จ จึงต้องกลืน click แรกที่ตามมาทิ้ง
 * เผื่อเวลาไว้สั้น ๆ เพราะนิ้วที่ลากแล้วยกขึ้นมักไม่มี click ตามมาเลย ไม่ควรไปกลืน click ครั้งถัดไปของจริง
 */
const SWALLOW_CLICK_MS = 400;

function swallowNextClick() {
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), SWALLOW_CLICK_MS);
}

function distanceTo(r: DOMRect, x: number, y: number): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}

function nearestTarget(root: HTMLElement, mode: DropKind, x: number, y: number): string | null {
  const attr = mode === 'slot' ? 'data-slot' : 'data-else';
  let best: string | null = null;
  let bestDist = SNAP_PX;
  root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
    if (el.dataset.disabled === '1') return;
    const d = distanceTo(el.getBoundingClientRect(), x, y);
    if (d < bestDist) {
      bestDist = d;
      best = el.getAttribute(attr);
    }
  });
  return best;
}

export function useBlockDrag({ containerRef, onDrop, onTap }: Options) {
  const [view, setView] = useState<DragView | null>(null);
  const pending = useRef<Pending | null>(null);

  const clearTimer = () => {
    const p = pending.current;
    if (p?.timer !== null && p?.timer !== undefined) {
      window.clearTimeout(p.timer);
      p.timer = null;
    }
  };

  const finish = useCallback(() => {
    clearTimer();
    pending.current = null;
    setView(null);
  }, []);

  const beginDrag = useCallback(
    (x: number, y: number) => {
      const p = pending.current;
      if (!p || p.dragging) return;
      p.dragging = true;
      clearTimer();
      try {
        p.el.setPointerCapture(p.pointerId);
      } catch {
        // บางเบราว์เซอร์ปฏิเสธ capture ถ้า pointer หลุดไปแล้ว — window listener ยังทำงานแทนได้
      }
      const root = containerRef.current;
      p.hoverKey = root ? nearestTarget(root, p.mode, x, y) : null;
      setView({ payload: p.payload, label: p.label, x, y, hoverKey: p.hoverKey, mode: p.mode });
    },
    [containerRef],
  );

  /** เรียกจาก onPointerDown ของบล็อก — ยังไม่ถือว่าลากจนกว่าจะขยับหรือกดค้าง */
  const start = useCallback<StartDrag>(
    (e, payload, label, mode = 'slot') => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const el = e.currentTarget as HTMLElement;
      pending.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        payload,
        label,
        mode,
        el,
        target: e.target,
        dragging: false,
        timer: null,
        hoverKey: null,
      };
      // กดค้างเพื่อลากมีไว้ให้นิ้ว (ขยับนิ้วนิดเดียวก็ถูกนับเป็นเลื่อนจอ) — เมาส์ไม่ต้องใช้
      // ถ้าเปิดให้เมาส์ด้วย คลิกช้า ๆ บนช่องค่ากลายเป็นการลากบล็อกแทนการเปิดเมนู
      if (e.pointerType === 'mouse') return;
      const { clientX, clientY } = e;
      pending.current.timer = window.setTimeout(() => beginDrag(clientX, clientY), LONG_PRESS_MS);
    },
    [beginDrag],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      if (!p.dragging) {
        const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
        if (moved < DRAG_THRESHOLD_PX) return;
        beginDrag(e.clientX, e.clientY);
        return;
      }
      e.preventDefault();
      const root = containerRef.current;
      p.hoverKey = root ? nearestTarget(root, p.mode, e.clientX, e.clientY) : null;
      setView({
        payload: p.payload,
        label: p.label,
        x: e.clientX,
        y: e.clientY,
        hoverKey: p.hoverKey,
        mode: p.mode,
      });
    };

    const up = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const { dragging, payload, hoverKey, mode, target } = p;
      finish();
      if (!dragging) {
        onTap(payload, target);
        return;
      }
      swallowNextClick();
      if (hoverKey !== null) onDrop(payload, mode, hoverKey);
    };

    const cancel = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      finish();
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [beginDrag, containerRef, finish, onDrop, onTap]);

  return { view, start };
}
