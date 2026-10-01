'use client';

/**
 * เข้าใช้ครั้งแรก (G0 ข้อ 3.1): GET /characters/current = 404 → ตั้งชื่อตัวละครช่องเดียว
 * ชื่อนี้คือสิ่งที่ผู้เล่นคนอื่นเห็นตอนดวล — ไม่ใช่ชื่อจริงจาก Core Hub
 */
import { useRef, useState, type FormEvent } from 'react';
import { cardClass, inputClass, useUnsavedWork } from '@/csmju';
import { Alert, Button } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { useToast } from '@/components/Toast';
import { api, ApiError, userMessage } from '@/lib/api/client';
import { fieldErrors } from '@/lib/api/field-errors';
import type { Character } from '@/lib/api/types';

// ตรงกับ DISPLAY_NAME_PATTERN ของ backend (character.dto.ts) — ตรวจก่อนส่งเพื่อบอกผลทันที backend ยังเป็นคนตัดสิน
const NAME_PATTERN = /^[A-Za-z0-9_฀-๿]{3,20}$/;

function localCheck(name: string): string | null {
  if (name.length === 0) return 'กรุณาตั้งชื่อตัวละคร';
  if (!NAME_PATTERN.test(name)) return 'ชื่อต้องยาว 3–20 ตัว ใช้ได้เฉพาะอักษรไทย a–z A–Z 0–9 และ _ (ไม่มีช่องว่าง)';
  return null;
}

export function CreateCharacter({ onCreated }: { onCreated: (c: Character) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  useUnsavedWork(name.trim() !== '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const local = localCheck(trimmed);
    setFormError(null);
    if (local) {
      setError(local);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const c = await api.post<Character>('/characters', { displayName: trimmed });
      toast(`สร้างตัวละคร ${c.displayName} แล้ว`);
      onCreated(c);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'VALIDATION_ERROR' || err.code === 'CONFLICT')) {
        const { byField, rest } = fieldErrors(err.details, ['displayName'] as const);
        setError(byField.displayName ?? (err.code === 'CONFLICT' ? err.message : rest[0] ?? err.message));
        inputRef.current?.focus();
      } else {
        setFormError(userMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${cardClass} fade-slide-up`} aria-labelledby="create-title">
      <div className="border-b border-outline-variant/40 px-6 py-5">
        <h2 id="create-title" className="font-display text-headline-md text-on-surface">
          ตั้งชื่อตัวละคร
        </h2>
        <p className="mt-1 text-body-md text-on-surface-variant">
          ชื่อนี้ผู้เล่นคนอื่นจะเห็นตอนดวลกันในแผนที่โลก ตั้งแล้วเปลี่ยนไม่ได้
        </p>
      </div>
      <form className="max-w-lg space-y-4 px-6 py-6" onSubmit={submit} noValidate>
        <p className="text-label-sm font-normal text-on-surface-variant">ช่องที่มี * จำเป็นต้องกรอก</p>
        <FormField label="ชื่อตัวละคร" required hint="3–20 ตัว · อักษรไทย a–z A–Z 0–9 และ _" error={error}>
          <input
            ref={inputRef}
            className={inputClass}
            value={name}
            autoComplete="off"
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name && setError(localCheck(name.trim()))}
          />
        </FormField>
        {formError && <Alert>{formError}</Alert>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" variant="primary" loading={busy}>
            เริ่มเล่น
          </Button>
        </div>
      </form>
    </section>
  );
}
