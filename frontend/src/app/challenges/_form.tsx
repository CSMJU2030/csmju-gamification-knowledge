'use client';

/**
 * ฟอร์มสร้าง/แก้โจทย์ (รวมมอนของโจทย์ — _monsters.tsx) — แยกจาก _parts.tsx เพื่อให้หน้ารายการโจทย์
 * ไม่ต้องโหลดตัวตรวจโปรแกรมและข้อมูลมอนของ engine ที่ฟอร์มใช้
 */
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { cardClass, inputClass, secondaryButtonClass, useUnsavedWork } from '@/csmju';
import { Button } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { useToast } from '@/components/Toast';
import { api, ApiError, userMessage } from '@/lib/api/client';
import { fieldErrors } from '@/lib/api/field-errors';
import type { Challenge, CreateChallenge } from '@/lib/api/types';
import { useRegionNames } from '@/lib/game/use-region-names';
import { MonsterEditor, draftOf, inputOf, monsterErrors, remapMonsterErrors, splitMonsterDetails, type MonsterDraft } from './_monsters';
import { ChallengeTrialPanel } from './_trial';

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
  const [drafts, setDrafts] = useState<MonsterDraft[]>(() => (initial?.monsters ?? []).map(draftOf));
  const [initialMonsters] = useState(() => JSON.stringify((initial?.monsters ?? []).map(draftOf).map(inputOf)));
  const [monsterErrs, setMonsterErrs] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // โจทย์ที่พิมพ์ค้างไว้ — เซสชันหมดกลางทางต้องไม่พาออกจากหน้าเอง (auth-contract ข้อ 7)
  useUnsavedWork(
    title !== (initial?.title ?? '') ||
      description !== (initial?.description ?? '') ||
      starterSource !== (initial?.starterSource ?? '') ||
      regionId !== (initial?.regionId ?? '') ||
      JSON.stringify(drafts.map(inputOf)) !== initialMonsters,
  );

  /** แก้/ลบมอน — ข้อความผิดที่ขึ้นอยู่ย้ายตามมอนตัวเดิม */
  const changeDrafts = (next: MonsterDraft[]) => {
    setMonsterErrs((errs) => remapMonsterErrors(errs, drafts, next));
    setDrafts(next);
  };

  /** พาโฟกัสไปช่องแรกที่ผิด (หลัง render ข้อความใต้ช่องแล้ว) */
  const focusFirstInvalid = () =>
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const local: Partial<Record<Field, string>> = {};
    if (!title.trim()) local.title = 'กรุณาใส่ชื่อโจทย์';
    const localMonsters = monsterErrors(drafts);
    setErrors(local);
    setMonsterErrs(localMonsters);
    const localCount = Object.keys(local).length + Object.keys(localMonsters).length;
    if (localCount > 0) {
      setFormError(`มีข้อผิดพลาด ${localCount} จุด กรุณาแก้ตามข้อความใต้ช่อง`);
      if (local.title) titleRef.current?.focus();
      else focusFirstInvalid();
      return;
    }

    const body: CreateChallenge = {
      title: title.trim(),
      description,
      regionId: regionId || null,
      ...(starterSource.trim() ? { starterSource } : {}),
      // แก้โจทย์: ส่งเสมอ (ลบมอนจนหมด = ส่ง []) · สร้างใหม่: ส่งเมื่อมีมอน
      ...(initial || drafts.length > 0 ? { monsters: drafts.map(inputOf) } : {}),
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
        const monsterPart = splitMonsterDetails(err.details);
        const { byField, rest } = fieldErrors(monsterPart.rest, FIELDS);
        if (byField.starterSource) {
          byField.starterSource = byField.starterSource
            .split(' · ')
            .map(readableProgramError)
            .join(' · ');
        }
        setErrors(byField);
        setMonsterErrs(monsterPart.monsters);
        const count = Object.keys(byField).length + Object.keys(monsterPart.monsters).length + rest.length;
        setFormError(rest.length ? rest.join(' · ') : `มีข้อผิดพลาด ${count} จุด กรุณาแก้ตามข้อความใต้ช่อง`);
        if (byField.title) titleRef.current?.focus();
        else focusFirstInvalid();
      } else {
        setFormError(userMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} className={`${cardClass} max-w-3xl`} onSubmit={submit} noValidate>
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
        <MonsterEditor drafts={drafts} onChange={changeDrafts} errors={monsterErrs} />
        {drafts.length > 0 && (
          <ChallengeTrialPanel
            drafts={drafts}
            starterSource={starterSource}
            onMonsterErrors={(errs) => {
              setMonsterErrs(errs);
              focusFirstInvalid();
            }}
          />
        )}
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
