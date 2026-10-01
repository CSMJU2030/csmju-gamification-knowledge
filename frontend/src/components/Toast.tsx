'use client';

/**
 * Toast (local component ชั่วคราว — ข้อ 9.1) · มุมขวาบนบน desktop บนสุดบนมือถือ · 4 วินาที
 * ใช้แจ้ง "สำเร็จ" หรือข้อมูลสั้น ๆ เท่านั้น — error ที่ผู้ใช้ต้องแก้ห้ามใช้ toast (ใช้ Alert inline)
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, CloseIcon, InfoIcon } from '@/csmju';

type ToastKind = 'success' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = ++next.current;
      setItems((all) => [...all.slice(-2), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-stretch gap-2 md:inset-x-auto md:right-6 md:w-96"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="fade-slide-up pointer-events-auto flex items-start gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 shadow-xl"
          >
            <span
              className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                t.kind === 'success' ? 'bg-success/10 text-emerald-700' : 'bg-primary-container/10 text-primary-container'
              }`}
            >
              {t.kind === 'success' ? <CheckIcon className="h-4 w-4" /> : <InfoIcon className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1 text-body-md text-on-surface">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="ปิดการแจ้งเตือน"
              className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-outline hover:bg-surface-variant/50 focus-visible:outline-2 focus-visible:outline-primary-container"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
