'use client';

/** ฟิลด์ฟอร์มมาตรฐาน (ข้อ 8.1): label มองเห็นได้ · * + aria-required · error ใต้ฟิลด์ผูก aria-describedby */
import { cloneElement, useId, type ReactElement } from 'react';
import { AlertIcon } from '@/csmju';

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  className?: string;
}

export function FormField({
  label,
  hint,
  error,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactElement<ControlProps>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  const control = cloneElement(children, {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
    className: `${children.props.className ?? ''} ${error ? 'input-error shake-anim' : ''}`,
  });

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-label-md text-on-surface">
        {label}
        {required && (
          <span className="text-error" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-label-sm font-normal text-on-surface-variant">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-label-sm text-error">
          <AlertIcon className="mt-px h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
