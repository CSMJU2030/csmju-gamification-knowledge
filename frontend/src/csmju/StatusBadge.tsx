import type { ReactNode } from 'react';

export type StatusTone = 'success' | 'info' | 'warning' | 'error' | 'neutral';

/** ตรงกับ TONE_STYLES (ข้อ 3.1 ตาราง Semantic) */
const TONE_STYLES: Record<StatusTone, { box: string; dot: string }> = {
  success: { box: 'bg-success/10 text-emerald-700', dot: 'bg-success' },
  info: { box: 'bg-primary-container/10 text-primary-container', dot: 'bg-primary-container' },
  warning: { box: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  error: { box: 'bg-error-container text-on-error-container', dot: 'bg-error' },
  neutral: { box: 'bg-surface-variant text-on-surface-variant', dot: 'bg-outline' },
};

export function StatusBadge({ tone, children, className = '' }: { tone: StatusTone; children: ReactNode; className?: string }) {
  const s = TONE_STYLES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-sm whitespace-nowrap ${s.box} ${className}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}
