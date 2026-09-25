'use client';

import { useRef, type KeyboardEvent } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/** Tabs มาตรฐาน (ข้อ 7.2.1) — ลูกศรซ้าย/ขวาเลื่อนแท็บ · Home/End ไปหัว/ท้าย */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  idPrefix = 'tab',
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-outline-variant/40">
      {items.map((item, i) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-${item.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-label-md transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-container ${
              selected
                ? 'border-primary-container text-primary-container'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-label-sm tabular-nums ${
                  selected ? 'bg-primary-container/10 text-primary-container' : 'bg-surface-variant text-on-surface-variant'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
