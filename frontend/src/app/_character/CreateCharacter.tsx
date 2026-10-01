'use client';

/**
 * เข้าใช้ครั้งแรก (G0 ข้อ 3.1): GET /characters/current = 404 → สร้างตัวละคร
 *
 * ชื่อในเกมคือรหัสนักศึกษา/บุคลากรที่ backend อ่านจาก Core Hub (/people/me) ตอนสร้าง — ผู้เล่นไม่ต้องพิมพ์อะไร
 * บัญชีที่ Core Hub ไม่มีรหัสให้ (เช่น บัญชีทดสอบ) backend ตอบ 400 ที่ช่อง displayName → ค่อยแสดงช่องตั้งชื่อเอง
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
// ต้องมีอักษรไทยอย่างน้อย 1 ตัว ชื่อสำรองจึงไม่มีวันซ้ำหรือปลอมเป็นรหัสนักศึกษา/บุคลากรของใคร
const NAME_PATTERN = /^(?=.*[฀-๿])[A-Za-z0-9_฀-๿]{3,20}$/;

function localCheck(name: string): string | null {
  if (name.length === 0) return 'กรุณาตั้งชื่อตัวละคร';
  if (!NAME_PATTERN.test(name)) {
    return 'ชื่อต้องยาว 3–20 ตัว มีอักษรไทยอย่างน้อย 1 ตัว ใช้ได้เฉพาะอักษรไทย a–z A–Z 0–9 และ _ (ไม่มีช่องว่าง)';
  }
  return null;
}

/** 400 ที่บอกว่าบัญชีนี้ไม่มีรหัสใน Core Hub — ต้องตั้งชื่อเอง */
const needsName = (err: unknown): boolean =>
  err instanceof ApiError &&
  err.code === 'VALIDATION_ERROR' &&
  fieldErrors(err.details, ['displayName'] as const).byField.displayName !== undefined;

export function CreateCharacter({ onCreated }: { onCreated: (c: Character) => void }) {
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  useUnsavedWork(askName && name.trim() !== '');

  const create = async (displayName?: string) => {
    setBusy(true);
    setFormError(null);
    try {
      const c = await api.post<Character>('/characters', displayName === undefined ? {} : { displayName });
      toast(`สร้างตัวละคร ${c.displayName} แล้ว`);
      onCreated(c);
    } catch (err) {
      if (!askName && needsName(err)) {
        setAskName(true);
        // ช่องตั้งชื่อเพิ่งแสดง — รอให้ render ก่อนค่อยโฟกัส
        requestAnimationFrame(() => inputRef.current?.focus());
      } else if (askName && err instanceof ApiError && (err.code === 'VALIDATION_ERROR' || err.code === 'CONFLICT')) {
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!askName) {
      void create();
      return;
    }
    const trimmed = name.trim();
    const local = localCheck(trimmed);
    if (local) {
      setError(local);
      setFormError(null);
      inputRef.current?.focus();
      return;
    }
    void create(trimmed);
  };

  return (
    <section className={`${cardClass} fade-slide-up`} aria-labelledby="create-title">
      <div className="border-b border-outline-variant/40 px-6 py-5">
        <h2 id="create-title" className="font-display text-headline-md text-on-surface">
          {askName ? 'ตั้งชื่อตัวละคร' : 'สร้างตัวละคร'}
        </h2>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {askName
            ? 'บัญชีนี้ไม่มีรหัสนักศึกษาหรือรหัสบุคลากรใน Core Hub (เช่น บัญชีทดสอบ) จึงต้องตั้งชื่อในเกมเอง ผู้เล่นคนอื่นจะเห็นชื่อนี้ตอนดวล ตั้งแล้วเปลี่ยนไม่ได้'
            : 'ชื่อในเกมของคุณคือรหัสนักศึกษา (บุคลากรใช้รหัสบุคลากร) จาก Core Hub ผู้เล่นคนอื่นจะเห็นรหัสนี้ตอนดวลกันในแผนที่โลก'}
        </p>
      </div>
      <form className="max-w-lg space-y-4 px-6 py-6" onSubmit={submit} noValidate>
        {askName && (
          <>
            <p className="text-label-sm font-normal text-on-surface-variant">ช่องที่มี * จำเป็นต้องกรอก</p>
            <FormField
              label="ชื่อตัวละคร"
              required
              hint="3–20 ตัว · มีอักษรไทยอย่างน้อย 1 ตัว · อักษรไทย a–z A–Z 0–9 และ _"
              error={error}
            >
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
          </>
        )}
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
