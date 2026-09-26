'use client';

/**
 * เลือกอาชีพครั้งเดียวหลังผ่านชั้น 1 (G0 ข้อ 3 · รอบ 2P §3.3)
 *
 * ของเดิมเป็นจอเต็มที่ข้ามไม่ได้ ตอนนี้เป็นการ์ดบนหน้าตัวละคร เพราะหน้าจอทั้งหมดต้องอยู่ใน AppShell
 * แต่เหตุผลเดิมยังอยู่: ผู้ฝึกหัดไม่มีสกิลเลย จึงวางการ์ดนี้ไว้บนสุดของหน้าทันทีที่เลือกได้
 * ข้อความพูดถึงสิ่งที่ผู้เล่นเพิ่งเห็นในการรบ และผูกกลับไปที่โปรแกรมเสมอ (อาชีพ = cast() สั่งอะไรได้)
 */
// import ตรงไฟล์ข้อความ (ไม่ผ่าน @tower/engine/lang) — ไม่ลากตัวแปลภาษาและ gamedata เข้าหน้าแรก
import { describeSkill } from '@tower/engine/skill-text';
import { PLAYABLE_CLASSES, type PlayableClassId } from '@tower/engine/types';
import { useState } from 'react';
import { CheckIcon, LockIcon, Modal, cardClass, secondaryButtonClass } from '@/csmju';
import { Alert, Button } from '@/components/feedback';
import { useToast } from '@/components/Toast';
import { api, userMessage } from '@/lib/api/client';
import type { Character } from '@/lib/api/types';
import { CLASS_GUIDE, CLASS_NAMES } from '@/lib/game/labels';
import { useGame } from '@/lib/game/session';
import { ClassTrials } from './ClassTrials';
import { Portrait } from './Portrait';

export function ClassChoice({ character, onChosen }: { character: Character; onChosen: (c: Character) => void }) {
  const [picked, setPicked] = useState<PlayableClassId | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // สกิลของแต่ละอาชีพมาจาก game-data (ชุดเดียวกับที่ตัวรบใช้) — ยังโหลดไม่เสร็จก็แค่ยังไม่แสดงรายการ
  const { gameData } = useGame();
  const skillsOf = (classId: string) =>
    (gameData?.skills ?? [])
      .filter((s) => s.classId === classId)
      .sort((a, b) => a.unlockLevel - b.unlockLevel || a.id.localeCompare(b.id));

  const unlocked = character.highestFloorCleared >= 1;

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api.patch<Character>('/characters/current', { classId: picked });
      setConfirming(false);
      toast(`เป็น${CLASS_NAMES[picked]}แล้ว — สกิลใหม่ใช้ใน cast() ได้ทันที`);
      onChosen(c);
    } catch (e) {
      setConfirming(false);
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cardClass} aria-labelledby="class-title">
      <div className="flex flex-col gap-3 border-b border-outline-variant/40 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="class-title" className="font-display text-headline-md text-on-surface">
            {unlocked ? 'ผ่านชั้น 1 แล้ว — เลือกอาชีพของคุณ' : 'อาชีพ'}
          </h2>
          <p className="mt-1 text-body-md text-on-surface-variant">
            อาชีพกำหนดว่าโปรแกรมของคุณเรียกสกิลอะไรได้ใน <code className="font-mono">cast()</code> · เลือกได้ครั้งเดียว
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-6 md:grid-cols-3">
        {PLAYABLE_CLASSES.map((c) => {
          const g = CLASS_GUIDE[c];
          const on = picked === c;
          return (
            <button
              key={c}
              type="button"
              disabled={!unlocked}
              aria-pressed={on}
              onClick={() => setPicked(c)}
              className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container disabled:cursor-not-allowed disabled:opacity-60 ${
                on
                  ? 'border-primary-container bg-primary-container/10'
                  : 'border-outline-variant/60 bg-surface-container-lowest hover:border-primary-container'
              }`}
            >
              <span className="flex items-center gap-3">
                <Portrait classId={c} size={48} alt="" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-display text-headline-md text-on-surface">
                    {CLASS_NAMES[c]}
                    {on && <CheckIcon className="h-5 w-5 text-primary-container" />}
                  </span>
                  <span className="block text-body-md text-on-surface-variant">{g.playTh}</span>
                </span>
              </span>
              <span className="space-y-2">
                <span className="block text-label-md text-on-surface">สกิลที่จะเรียกได้</span>
                {skillsOf(c).map((s) => {
                  const t = describeSkill(s);
                  return (
                    <span key={s.id} className="block text-body-md text-on-surface-variant">
                      <span className="block">
                        <strong className="font-semibold text-on-surface">{s.nameTh}</strong>
                        <span className="tabular-nums"> · เลเวล {s.unlockLevel} · MP {s.mpCost}</span>
                      </span>
                      {t.descTh && <span className="block">{t.descTh}</span>}
                      <span className="block text-label-md">
                        {t.kindTh} · {t.effectTh} · {t.targetTh}
                      </span>
                    </span>
                  );
                })}
              </span>
              <span className="block text-body-md text-on-surface-variant">{g.programTh}</span>
              <span className="block text-label-md text-on-surface-variant">
                ความชำนาญที่ขึ้นเป็นหลัก: {g.growsTh} · ระวัง: {g.careTh}
              </span>
            </button>
          );
        })}
      </div>

      <ClassTrials character={character} />

      <div className="flex flex-col gap-3 border-t border-outline-variant/40 px-6 py-4 md:flex-row md:items-center md:justify-end">
        {error && (
          <div className="md:mr-auto">
            <Alert>{error}</Alert>
          </div>
        )}
        {!unlocked && (
          <p id="class-reason" className="flex items-center gap-2 text-body-md text-on-surface-variant md:mr-auto">
            <LockIcon className="h-4 w-4 shrink-0" />
            ต้องผ่านชั้น 1 ก่อนถึงจะเลือกอาชีพได้
          </p>
        )}
        <Button
          variant="primary"
          disabled={!unlocked || !picked}
          aria-describedby={!unlocked ? 'class-reason' : undefined}
          onClick={() => setConfirming(true)}
        >
          {picked ? `เลือก${CLASS_NAMES[picked]}` : 'แตะการ์ดเพื่อเลือกอาชีพ'}
        </Button>
      </div>

      <Modal
        open={confirming && !!picked}
        title={picked ? `ยืนยันเป็น${CLASS_NAMES[picked]}?` : ''}
        onClose={() => !busy && setConfirming(false)}
        footer={
          <>
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => setConfirming(false)}>
              ยกเลิก
            </button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              ยืนยันอาชีพ
            </Button>
          </>
        }
      >
        <p>
          หลังจากนี้ <strong className="text-on-surface">เปลี่ยนอาชีพไม่ได้</strong> สกิลของอาชีพอื่นจะเรียกในโปรแกรมไม่ได้เลย
        </p>
      </Modal>
    </section>
  );
}
