'use client';

/**
 * local component ชั่วคราว (ui-design-system ข้อ 17.0: ของในข้อ 7.1 ที่ template ยังไม่มี
 * ให้ประกอบใน components/ จาก class ใน ui.ts + token เท่านั้น) — ระบุไว้ใน subsystem.yaml → local_components
 */
import Link from '@/components/AppLink';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import {
  AlertIcon,
  InfoIcon,
  RefreshIcon,
  cardClass,
  dangerButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/csmju';

/* ---------- ปุ่มที่มีสถานะ loading (ข้อ 7.2) ---------- */

type Variant = 'primary' | 'secondary' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: primaryButtonClass,
  secondary: secondaryButtonClass,
  danger: dangerButtonClass,
};

export function Button({
  variant = 'secondary',
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type={type}
      className={`${VARIANT[variant]} ${loading ? 'btn-loading' : ''} ${className}`}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...rest}
    >
      <span className="btn-text flex items-center gap-2">{children}</span>
      <span className="dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </button>
  );
}

/* ---------- Skeleton ---------- */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden="true" />;
}

/** โครงหน้าระหว่างโหลด — มีข้อความสำหรับ screen reader */
export function LoadingRegion({ label = 'กำลังโหลดข้อมูล', children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}...</span>
      {children}
    </div>
  );
}

/* ---------- EmptyState / ErrorState (ข้อ 9) ---------- */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={`${cardClass} flex flex-col items-center gap-3 px-6 py-12 text-center`}>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-primary-container">
        {icon ?? <InfoIcon className="h-6 w-6" />}
      </span>
      <h2 className="font-display text-headline-md text-on-surface">{title}</h2>
      {description && <p className="max-w-md text-body-md text-on-surface-variant">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'ระบบขัดข้องชั่วคราว',
  message = 'กรุณาลองอีกครั้ง หากยังพบปัญหา กรุณาแจ้งผู้ดูแลระบบ',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className={`${cardClass} flex flex-col items-center gap-3 px-6 py-12 text-center`} role="alert">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-error-container text-on-error-container">
        <AlertIcon className="h-6 w-6" />
      </span>
      <h2 className="font-display text-headline-md text-on-surface">{title}</h2>
      <p className="max-w-md text-body-md text-on-surface-variant">{message}</p>
      {onRetry && (
        <button type="button" className={`${secondaryButtonClass} mt-2`} onClick={onRetry}>
          <RefreshIcon className="h-4 w-4" />
          ลองอีกครั้ง
        </button>
      )}
    </div>
  );
}

/** ไม่มีสิทธิ์ (FORBIDDEN) — ข้อความมาตรฐานข้อ 9.3 */
export function ForbiddenState() {
  return (
    <EmptyState
      title="ไม่มีสิทธิ์เข้าถึง"
      description="คุณไม่มีสิทธิ์ใช้งานส่วนนี้ หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ"
      icon={<AlertIcon className="h-6 w-6" />}
      action={
        <Link href="/" className={secondaryButtonClass}>
          กลับหน้าตัวละคร
        </Link>
      }
    />
  );
}

/* ---------- Alert inline ---------- */

export function Alert({
  tone = 'error',
  children,
  action,
}: {
  tone?: 'error' | 'info' | 'success';
  children: ReactNode;
  action?: ReactNode;
}) {
  const style =
    tone === 'error'
      ? 'bg-error-container text-on-error-container'
      : tone === 'success'
        ? 'bg-sso-container text-sso'
        : 'bg-primary-container/10 text-primary-container';
  const Icon = tone === 'error' ? AlertIcon : InfoIcon;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex flex-col gap-3 rounded-lg px-4 py-3 text-body-md sm:flex-row sm:items-center ${style}`}
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <span className="min-w-0">{children}</span>
      </span>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}
