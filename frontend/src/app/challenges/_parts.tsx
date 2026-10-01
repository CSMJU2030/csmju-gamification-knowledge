'use client';

/**
 * ของที่หน้าโจทย์ใช้ร่วมกัน: สิทธิ์แก้/ลบ · ปุ่มลบพร้อมยืนยัน · ฟอร์มสร้าง/แก้
 * UI ตัดสินจาก permissions ใน GET /me (G0 ข้อ 4) — backend ตรวจความเป็นเจ้าของซ้ำเสมอ
 */
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ConfirmDeleteModal, cardClass, inputClass, secondaryButtonClass, useUnsavedWork } from '@/csmju';
import { Alert, Button } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { useToast } from '@/components/Toast';
import { api, ApiError, userMessage } from '@/lib/api/client';
import { fieldErrors } from '@/lib/api/field-errors';
import type { Challenge, CreateChallenge } from '@/lib/api/types';
import { useGame } from '@/lib/game/session';
import { useRegionNames } from '@/lib/game/use-region-names';

export function useChallengePermissions() {
  const { can, coreUserId } = useGame();
  return {
    canCreate: can('challenge:create'),
    canEdit: (c: Challenge) => can('challenge:update:any') || (can('challenge:update:own') && c.coreUserId === coreUserId),
    canDelete: (c: Challenge) => can('challenge:delete:any') || (can('challenge:delete:own') && c.coreUserId === coreUserId),
    isMine: (c: Challenge) => c.coreUserId === coreUserId,
  };
}

export function DeleteChallenge({
  challenge,
  onDeleted,
  children,
  className,
}: {
  challenge: Challenge;
  onDeleted: () => void;
  children: ReactNode;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/challenges/${challenge.id}`);
      setOpen(false);
      toast(`ลบโจทย์ "${challenge.title}" แล้ว`);
      onDeleted();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-label={`ลบ ${challenge.title}`}>
        {children}
      </button>
      <ConfirmDeleteModal
        open={open}
        title="ลบโจทย์"
        itemName={challenge.title}
        description={
          <>
            ผู้เล่นที่เปิดโจทย์นี้อยู่จะไม่เห็นอีก ลบแล้วเอาคืนไม่ได้
            {error && (
              <span className="mt-3 block">
                <Alert>{error}</Alert>
              </span>
            )}
          </>
        }
        loading={busy}
        onCancel={() => !busy && setOpen(false)}
        onConfirm={() => void remove()}
      />
    </>
  );
}

const FIELDS = ['title', 'description', 'starterSource', 'regionId'] as const;
type Field = (typeof FIELDS)[number];

/** starterSource ผิดไวยากรณ์ → backend ตอบ "starterSource: บรรทัด:คอลัมน์:ชื่อ:ข้อความ" — แปลงเป็นข้อความอ่านง่าย */
function readableProgramError(text: string): string {
  const m = /^(\d+):(\d+):[^:]+:(.*)$/.exec(text.trim());
  return m ? `บรรทัด ${m[1]} คอลัมน์ ${m[2]}: ${m[3].trim()}` : text;
}

export function ChallengeForm({ initial }: { initial?: Challenge }) {
  const router = useRouter();
  const toast = useToast();
  const regions = useRegionNames();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [starterSource, setStarterSource] = useState(initial?.starterSource ?? '');
  const [regionId, setRegionId] = useState(initial?.regionId ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  // โจทย์ที่พิมพ์ค้างไว้ — เซสชันหมดกลางทางต้องไม่พาออกจากหน้าเอง (auth-contract ข้อ 7)
  useUnsavedWork(
    title !== (initial?.title ?? '') ||
      description !== (initial?.description ?? '') ||
      starterSource !== (initial?.starterSource ?? '') ||
      regionId !== (initial?.regionId ?? ''),
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const local: Partial<Record<Field, string>> = {};
    if (!title.trim()) local.title = 'กรุณาใส่ชื่อโจทย์';
    setErrors(local);
    if (local.title) {
      titleRef.current?.focus();
      return;
    }

    const body: CreateChallenge = {
      title: title.trim(),
      description,
      regionId: regionId || null,
      ...(starterSource.trim() ? { starterSource } : {}),
    };
    setBusy(true);
    try {
      const saved = initial
        ? await api.patch<Challenge>(`/challenges/${initial.id}`, body)
        : await api.post<Challenge>('/challenges', body);
      toast(initial ? 'บันทึกการแก้ไขโจทย์แล้ว' : 'สร้างโจทย์แล้ว');
      router.push(`/challenges/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const { byField, rest } = fieldErrors(err.details, FIELDS);
        if (byField.starterSource) {
          byField.starterSource = byField.starterSource
            .split(' · ')
            .map(readableProgramError)
            .join(' · ');
        }
        setErrors(byField);
        const count = Object.keys(byField).length + rest.length;
        setFormError(rest.length ? rest.join(' · ') : `มีข้อผิดพลาด ${count} จุด กรุณาแก้ตามข้อความใต้ช่อง`);
        if (byField.title) titleRef.current?.focus();
      } else {
        setFormError(userMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`${cardClass} max-w-3xl`} onSubmit={submit} noValidate>
      <div className="space-y-4 px-6 py-6">
        <p className="text-label-sm font-normal text-on-surface-variant">ช่องที่มี * จำเป็นต้องกรอก</p>
        <FormField label="ชื่อโจทย์" required error={errors.title}>
          <input ref={titleRef} className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="คำอธิบาย" hint="บอกผู้เล่นว่าต้องทำให้โปรแกรมทำอะไร และจะรู้ได้อย่างไรว่าทำได้แล้ว" error={errors.description}>
          <textarea
            className={`${inputClass} min-h-32`}
            value={description}
            maxLength={4000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField label="ภูมิภาคที่ใช้ทดสอบ" hint="ไม่บังคับ — ผู้เล่นจะเห็นว่าควรลองโปรแกรมที่โซนไหน" error={errors.regionId}>
          <select className={`${inputClass} md:w-72`} value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            <option value="">ไม่ผูกกับภูมิภาค</option>
            {(regions ?? []).filter((r) => r.depths > 0).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameTh}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label="โปรแกรมตั้งต้น (BloxCode)"
          hint="ไม่บังคับ — ถ้าเว้นไว้ ผู้เล่นจะได้โปรแกรมพื้นฐาน · ต้องมี def turn():"
          error={errors.starterSource}
        >
          <textarea
            className={`${inputClass} min-h-48 font-mono`}
            value={starterSource}
            spellCheck={false}
            onChange={(e) => setStarterSource(e.target.value)}
            placeholder={'def turn():\n    attack(weakest(enemies))'}
          />
        </FormField>
        <p ref={liveRef} aria-live="polite" className="sr-only">
          {formError ?? ''}
        </p>
        {formError && <p className="text-label-sm text-error">{formError}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t border-outline-variant/40 px-6 py-4">
        <button type="button" className={secondaryButtonClass} onClick={() => router.back()} disabled={busy}>
          ยกเลิก
        </button>
        <Button type="submit" variant="primary" loading={busy}>
          {initial ? 'บันทึกการแก้ไข' : 'สร้างโจทย์'}
        </Button>
      </div>
    </form>
  );
}
