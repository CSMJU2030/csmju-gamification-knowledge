'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';
import { dangerButtonClass, secondaryButtonClass } from './ui';

/** Modal มาตรฐาน (ข้อ 7.2.1) — ปิดด้วย Esc / คลิก scrim · โฟกัสเข้ากล่องตอนเปิด คืนโฟกัสตอนปิด */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const focusable = () =>
      Array.from(
        box?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])') ?? [],
      );
    (focusable()[1] ?? focusable()[0] ?? box)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fade-slide-up relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-headline-md text-on-surface">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="-mt-1 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-outline hover:bg-surface-variant/50 focus-visible:outline-2 focus-visible:outline-primary-container"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-4 text-body-md text-on-surface-variant">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDeleteModal({
  open,
  title = 'ยืนยันการลบ',
  itemName,
  description,
  confirmLabel = 'ลบ',
  blockedReason,
  loading = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  itemName: string;
  description?: ReactNode;
  confirmLabel?: string;
  blockedReason?: string | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={secondaryButtonClass} onClick={onCancel}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={`${dangerButtonClass} ${loading ? 'btn-loading' : ''}`}
            aria-busy={loading}
            disabled={!!blockedReason || loading}
            onClick={onConfirm}
          >
            <span className="btn-text flex items-center gap-2">{confirmLabel}</span>
            <span className="dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </>
      }
    >
      <p>
        ต้องการ{confirmLabel} <strong className="text-on-surface">{itemName}</strong> ใช่ไหม
      </p>
      {description && <div className="mt-2">{description}</div>}
      {blockedReason && (
        <p className="mt-4 rounded-lg bg-error-container px-4 py-3 text-on-error-container" role="alert">
          {blockedReason}
        </p>
      )}
    </Modal>
  );
}
