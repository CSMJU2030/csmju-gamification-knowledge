'use client';

/**
 * ช่องค้นหาของตาราง (ui-design-system ข้อ 8.2 — ทุกตารางต้องมีช่องค้นหา)
 *
 * - คำค้นส่งให้ backend (`?q=`) ไม่กรองในหน้าเว็บ — กรองเองจะผิดเมื่อข้อมูลมีหลายหน้า
 * - ค้นเองหลังหยุดพิมพ์ 300ms · Enter ค้นทันที · Esc หรือปุ่ม × ล้าง
 * - label มองเห็นได้ (ข้อ 18.2) · ผลลัพธ์อ่านออกเสียงผ่าน aria-live
 */
import { useEffect, useId, useRef, useState } from 'react';
import { CloseIcon, SearchIcon, iconButtonClass, inputClass } from '@/csmju';

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MAX_LENGTH = 100;

/** รูปเดียวกับที่ backend ใช้ (ตัดหัวท้าย · ยุบช่องว่างซ้อน) — ค่าเท่ากันจะไม่ยิงคำขอซ้ำ */
export const normalizeQuery = (text: string): string => text.trim().replace(/\s+/g, ' ');

export function SearchField({
  label,
  placeholder,
  value,
  onSearch,
  status,
}: {
  label: string;
  placeholder: string;
  /** คำค้นที่ใช้อยู่ตอนนี้ (ค่าที่ normalize แล้ว) */
  value: string;
  onSearch: (q: string) => void;
  /** ข้อความผลการค้นหา เช่น "พบ 3 รายการ" — ว่าง = ไม่ประกาศ */
  status?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  // ล้างจากข้างนอก (เช่น ปุ่ม "ล้างการค้นหา" ในสถานะค้นไม่พบ) → ช่องต้องว่างตาม
  useEffect(() => {
    setText((t) => (normalizeQuery(t) === value ? t : value));
  }, [value]);

  useEffect(() => {
    const next = normalizeQuery(text);
    if (next === value) return;
    const timer = setTimeout(() => onSearchRef.current(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value]);

  const clear = () => {
    setText('');
    if (value !== '') onSearch('');
    inputRef.current?.focus();
  };

  return (
    <form
      role="search"
      aria-labelledby={`${id}-label`}
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const next = normalizeQuery(text);
        if (next !== value) onSearch(next);
      }}
    >
      <label id={`${id}-label`} htmlFor={id} className="block text-label-md text-on-surface">
        {label}
      </label>
      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
        <input
          ref={inputRef}
          id={id}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={SEARCH_MAX_LENGTH}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && text !== '') {
              e.preventDefault();
              clear();
            }
          }}
          className={`${inputClass} pl-10 pr-11 [&::-webkit-search-cancel-button]:appearance-none`}
        />
        {text !== '' && (
          <button
            type="button"
            onClick={clear}
            aria-label="ล้างการค้นหา"
            className={`${iconButtonClass} absolute right-0.5 top-1/2 -translate-y-1/2 md:right-1.5`}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      <p aria-live="polite" className="min-h-5 text-caption text-on-surface-variant">
        {status}
      </p>
    </form>
  );
}
