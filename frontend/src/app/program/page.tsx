'use client';

/**
 * /program — เขียน/แก้โปรแกรมที่ตัวละครใช้สู้ (G0 ข้อ 3)
 *
 * หน้าถือ source ไว้เอง (เอดิเตอร์เป็น controlled) เพราะงานสามอย่างนี้เป็นของหน้า ไม่ใช่ของเอดิเตอร์:
 *   1. บันทึก — PATCH /programs/current · 400 VALIDATION_ERROR → แผงข้อผิดพลาด + ไฮไลต์บรรทัด (ห้าม toast)
 *   2. เตือนก่อนออกจากหน้าเมื่อยังไม่บันทึก — ปิดแท็บ (beforeunload) และคลิกลิงก์ในแอป (modal)
 *   3. ?starter=<challengeId> — ใส่โปรแกรมตั้งต้นจากโจทย์ (ยังไม่บันทึกจนกว่าจะกดบันทึก)
 *
 * เอดิเตอร์ + ล่ามหนัก จึงโหลดด้วย next/dynamic (ssr:false) — หน้าอื่นไม่ต้องจ่ายค่าล่ามใน JS แรกเข้า
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Alert, Button, EmptyState, ErrorState, ForbiddenState, Skeleton } from '@/components/feedback';
import { useToast } from '@/components/Toast';
import { CodeIcon, Modal, PageHeader, StatusBadge, dangerButtonClass, primaryButtonClass, secondaryButtonClass } from '@/csmju';
import { ApiError, userMessage } from '@/lib/api/client';
import type { Challenge } from '@/lib/api/types';
import { useApi } from '@/lib/api/use-api';
import EditorSkeleton from '@/game-stage/blox/EditorSkeleton';
import {
  ProgramRejected,
  getChallenge,
  getProgram,
  saveProgram,
  type Program,
  type ServerRejection,
} from '@/game-stage/blox/program-api';

const BloxEditor = dynamic(() => import('@/game-stage/blox/BloxEditor'), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

const TITLE = 'โปรแกรม BloxCode';
const DESCRIPTION = 'ต่อบล็อกหรือเขียน Python สั่งว่าตัวละครจะทำอะไรในแต่ละเทิร์น — ทุกการรบใช้โปรแกรมที่บันทึกล่าสุด';

export default function ProgramPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ไม่งั้น next build หยุดที่หน้านี้ (หน้าถูก prerender เป็นเปลือกเปล่า)
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProgramScreen />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <EditorSkeleton />
    </div>
  );
}

function ProgramScreen() {
  const starterId = useSearchParams().get('starter');
  const program = useApi((signal) => getProgram(signal), []);

  let body;
  if (program.status === 'loading') {
    body = (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">กำลังโหลดโปรแกรม...</span>
        <EditorSkeleton />
      </div>
    );
  } else if (program.status === 'error') {
    const { code } = program.error;
    body =
      code === 'NOT_FOUND' ? (
        <EmptyState
          icon={<CodeIcon className="h-6 w-6" />}
          title="ยังไม่มีตัวละคร"
          description="สร้างตัวละครก่อน แล้วค่อยกลับมาเขียนโปรแกรมที่มันใช้สู้"
          action={
            <Link href="/" className={primaryButtonClass}>
              สร้างตัวละคร
            </Link>
          }
        />
      ) : code === 'FORBIDDEN' ? (
        <ForbiddenState />
      ) : (
        <ErrorState onRetry={program.reload} />
      );
  } else {
    body = <Workspace initial={program.data} starterId={starterId} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={TITLE} description={DESCRIPTION} />
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Workspace({ initial, starterId }: { initial: Program; starterId: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const [meta, setMeta] = useState(initial);
  const [source, setSource] = useState(initial.source ?? '');
  const [saved, setSaved] = useState(initial.source ?? '');
  const [server, setServer] = useState<ServerRejection | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  const dirty = source !== saved;

  /** การแก้ทุกครั้งทำให้ผลตรวจของเซิร์ฟเวอร์รอบก่อนหมดอายุ — มันตรวจ source คนละชุดกับที่เห็นแล้ว */
  const change = useCallback((next: string) => {
    setSource(next);
    setServer(null);
    setSaveError(null);
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await saveProgram(source);
      setMeta(next);
      setSource(next.source);
      setSaved(next.source);
      setServer(null);
      toast('บันทึกโปรแกรมแล้ว');
    } catch (e) {
      if (e instanceof ProgramRejected) {
        setServer(e.rejection);
        // จอแคบแผงข้อผิดพลาดอยู่ใต้เอดิเตอร์ — เลื่อนไปให้เห็น (จอกว้างมันอยู่ข้าง ๆ แล้ว 'nearest' จึงไม่ขยับ)
        requestAnimationFrame(() =>
          document.getElementById('blox-errors')?.scrollIntoView({
            block: 'nearest',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          }),
        );
      } else if (!(e instanceof ApiError && e.code === 'UNAUTHORIZED')) {
        setSaveError(userMessage(e));
      }
    } finally {
      setSaving(false);
    }
  }, [saving, source, toast]);

  // ปิดแท็บ/รีโหลดทั้งที่ยังไม่บันทึก → ให้เบราว์เซอร์ถามก่อน (ข้อความของกล่องนี้เบราว์เซอร์กำหนดเอง)
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  /**
   * คลิกลิงก์ภายในแอป (เมนูข้าง ปุ่ม "ลงรบ") ไม่ยิง beforeunload เพราะ Next เปลี่ยนหน้าเองโดยไม่โหลดใหม่
   * จึงดักที่ capture phase ของ document ก่อนถึงตัวจัดการของ <Link> แล้วถามด้วย Modal ของเราเอง
   */
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  const stay = useCallback(() => setLeaveTo(null), []);

  return (
    <>
      {starterId && <StarterNotice id={starterId} source={source} dirty={dirty} onApply={change} />}

      {saveError && (
        <Alert tone="error">
          <span className="font-semibold">บันทึกไม่สำเร็จ</span> — {saveError}
        </Alert>
      )}

      <BloxEditor
        program={meta}
        source={source}
        onSourceChange={change}
        server={server}
        actions={
          <>
            {dirty ? (
              <StatusBadge tone="warning">ยังไม่บันทึก</StatusBadge>
            ) : (
              <StatusBadge tone="success">บันทึกแล้ว</StatusBadge>
            )}
            <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
              บันทึกโปรแกรม
            </Button>
          </>
        }
      />

      <Modal
        open={leaveTo !== null}
        title="ออกจากหน้านี้โดยไม่บันทึก?"
        onClose={stay}
        footer={
          <>
            <button type="button" className={secondaryButtonClass} onClick={stay}>
              ยกเลิก
            </button>
            <button
              type="button"
              className={dangerButtonClass}
              onClick={() => {
                const to = leaveTo;
                setLeaveTo(null);
                // ออกแล้วก็ไม่ต้องถามซ้ำตอนปิดแท็บ — ถอดตัวเตือนด้วยการถือว่าไม่มีอะไรค้าง
                setSaved(source);
                if (to) router.push(to);
              }}
            >
              ออกโดยไม่บันทึก
            </button>
          </>
        }
      >
        <p>โปรแกรมที่แก้ไว้ยังไม่ได้บันทึก ถ้าออกตอนนี้การแก้ไขจะหายไป และการรบครั้งถัดไปจะใช้โปรแกรมที่บันทึกไว้ล่าสุด</p>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

/**
 * แถบ "เปิดโปรแกรมตั้งต้นจากโจทย์" — หน้าโจทย์ลิงก์มาด้วย ?starter=<challengeId>
 * ไม่แทนโปรแกรมให้ทันทีที่เปิดหน้า เพราะจะทับงานที่ผู้เล่นทำค้างไว้โดยเขาไม่ได้ตัดสินใจเอง
 */
function StarterNotice({
  id,
  source,
  dirty,
  onApply,
}: {
  id: string;
  source: string;
  dirty: boolean;
  onApply: (next: string) => void;
}) {
  const challenge = useApi<Challenge>((signal) => getChallenge(id, signal), [id]);
  /** โปรแกรมก่อนกด "ใช้โปรแกรมตั้งต้นนี้" — ไว้ย้อนกลับ ถ้าผู้เล่นเปลี่ยนใจก่อนบันทึก */
  const [before, setBefore] = useState<string | null>(null);

  if (challenge.status === 'loading') return <Skeleton className="h-14 w-full" />;

  if (challenge.status === 'error') {
    const code = challenge.error.code;
    const text =
      code === 'NOT_FOUND' || code === 'VALIDATION_ERROR' || code === 'BAD_REQUEST'
        ? 'ไม่พบโจทย์ที่ลิงก์มา อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง'
        : userMessage(challenge.error);
    return (
      <Alert
        tone="error"
        action={
          <Link href="/challenges" className={secondaryButtonClass}>
            ดูโจทย์ทั้งหมด
          </Link>
        }
      >
        {text}
      </Alert>
    );
  }

  const c = challenge.data;
  const onStarter = source === c.starterSource;

  if (onStarter) {
    return (
      <Alert
        tone={dirty ? 'info' : 'success'}
        action={
          before !== null && dirty ? (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                onApply(before);
                setBefore(null);
              }}
            >
              ย้อนกลับเป็นโปรแกรมเดิม
            </button>
          ) : undefined
        }
      >
        {dirty ? (
          <>
            ใส่โปรแกรมตั้งต้นจากโจทย์ <strong>{c.title}</strong> แล้ว — ยังไม่ได้บันทึก กด &quot;บันทึกโปรแกรม&quot;
            เพื่อให้ตัวละครใช้ในการรบ
          </>
        ) : (
          <>
            โปรแกรมของคุณคือโปรแกรมตั้งต้นจากโจทย์ <strong>{c.title}</strong>
          </>
        )}
      </Alert>
    );
  }

  return (
    <Alert
      tone="info"
      action={
        <span className="flex flex-wrap gap-2">
          <Link href={`/challenges/${encodeURIComponent(c.id)}`} className={secondaryButtonClass}>
            อ่านโจทย์
          </Link>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              setBefore(source);
              onApply(c.starterSource);
            }}
          >
            ใช้โปรแกรมตั้งต้นนี้
          </button>
        </span>
      }
    >
      เปิดโปรแกรมตั้งต้นจากโจทย์ <strong>{c.title}</strong>
    </Alert>
  );
}
