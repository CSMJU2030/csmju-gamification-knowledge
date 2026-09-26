'use client';

/**
 * "ลองดูก่อนเลือก" — ตัวอย่างการรบของแต่ละอาชีพ (playtest รอบ B ข้อ 3 · 26 ก.ย. 2026)
 *
 * ผู้เล่นรายงานว่าเลือกอาชีพแบบเดา เพราะตอนนั้นใช้แค่ attack มาตลอดและไม่เคยเห็นอาชีพไหนสู้
 * ส่วนนี้ขอ POST /characters/current/class-trials (ตัวละครจริง · เวฟเดียวกันทุกอาชีพ · ไม่บันทึก)
 * แล้วเล่นฉากด้วยตัวเล่นเดียวกับการรบจริง พร้อมโปรแกรมตัวอย่างในแผงโค้ด และตารางเทียบตัวเลข
 */
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { PLAYABLE_CLASSES, type PlayableClassId } from '@tower/engine/types';
import { secondaryButtonClass } from '@/csmju';
import { Alert } from '@/components/feedback';
import { api, userMessage } from '@/lib/api/client';
import type { Character, ClassTrial } from '@/lib/api/types';
import { CLASS_NAMES, fmt } from '@/lib/game/labels';
import { useGame } from '@/lib/game/session';
import StageSkeleton from '@/game-stage/battle/StageSkeleton';

/** ตัวเล่นฉาก (renderer + สไปรต์) แยก chunk — โหลดเมื่อกดดูตัวอย่างเท่านั้น ไม่เพิ่ม JS แรกเข้าของหน้าตัวละคร */
const BattlePlayer = dynamic(() => import('@/game-stage/battle/BattlePlayer'), {
  ssr: false,
  loading: () => <StageSkeleton />,
});

const noop = () => {};

export function ClassTrials({ character }: { character: Character }) {
  const { gameData } = useGame();
  const [trials, setTrials] = useState<Partial<Record<PlayableClassId, ClassTrial>>>({});
  const [shown, setShown] = useState<PlayableClassId | null>(null);
  const [busy, setBusy] = useState<PlayableClassId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (c: PlayableClassId) => {
    setError(null);
    if (trials[c]) {
      setShown(c);
      return;
    }
    setBusy(c);
    try {
      const t = await api.post<ClassTrial>('/characters/current/class-trials', { classId: c });
      setTrials((prev) => ({ ...prev, [c]: t }));
      setShown(c);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const trial = shown ? trials[shown] : undefined;
  // ตัวละครบนเวที = ตัวเดิม เปลี่ยนแค่อาชีพ (สไปรต์) และหลอดเลือด/MP ตามที่ตัวอย่างคิดจริง
  const stageCharacter = useMemo<Character | null>(
    () =>
      trial
        ? {
            ...character,
            classId: trial.classId,
            derived: { ...character.derived, maxHp: trial.maxHp, maxMp: trial.maxMp },
          }
        : null,
    [trial, character],
  );
  const tried = PLAYABLE_CLASSES.filter((c) => trials[c]);

  return (
    <section aria-labelledby="class-trials-title" className="border-t border-outline-variant/40 px-6 py-5">
      <h3 id="class-trials-title" className="font-display text-label-md text-on-surface">
        ลองดูก่อนเลือก
      </h3>
      <p className="mt-1 text-body-md text-on-surface-variant">
        ตัวละครของคุณ (เลเวล {character.level}) สู้เวฟแรก ๆ ด้วยโปรแกรมตัวอย่างของแต่ละอาชีพ · ทุกอาชีพเจอเวฟเดียวกัน ·
        ไม่ได้รางวัลและไม่บันทึก
      </p>
      <div role="group" aria-label="ดูตัวอย่างการรบของอาชีพ" className="mt-3 flex flex-wrap gap-2">
        {PLAYABLE_CLASSES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={shown === c}
            disabled={busy !== null}
            onClick={() => void open(c)}
            className={`${secondaryButtonClass} ${shown === c ? 'border-primary-container bg-primary-container/10 text-primary-container' : ''}`}
          >
            {busy === c ? 'กำลังเตรียมฉาก…' : `ดู${CLASS_NAMES[c]}สู้`}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {tried.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-body-md">
            <caption className="sr-only">เทียบตัวอย่างการรบของแต่ละอาชีพ</caption>
            <thead className="text-label-md text-on-surface-variant">
              <tr className="border-b border-outline-variant/40">
                <th scope="col" className="py-2 pr-3 font-medium">อาชีพ</th>
                <th scope="col" className="py-2 pr-3 font-medium">ผล</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">ร่ายสกิล</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">ดาเมจที่ทำ</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">เลือดที่เสีย</th>
                <th scope="col" className="py-2 text-right font-medium">เลือดเหลือ</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {tried.map((c) => {
                const t = trials[c]!;
                return (
                  <tr key={c} className="border-b border-outline-variant/20 last:border-0">
                    <th scope="row" className="py-2 pr-3 font-semibold text-on-surface">{CLASS_NAMES[c]}</th>
                    <td className="py-2 pr-3 text-on-surface-variant">
                      {t.result.victory ? 'ผ่าน' : 'ไม่ผ่าน'} {t.result.wavesCleared}/{t.waves} เวฟ
                    </td>
                    <td className="py-2 pr-3 text-right">{fmt(t.summary.skillCasts)} ครั้ง</td>
                    <td className="py-2 pr-3 text-right">{fmt(t.summary.damageDealt)}</td>
                    <td className="py-2 pr-3 text-right">{fmt(t.summary.damageTaken)}</td>
                    <td className="py-2 text-right">{t.summary.hpLeftPct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {trial && stageCharacter && (
        <div className="mt-4">
          <BattlePlayer
            key={trial.classId}
            events={trial.result.events}
            character={stageCharacter}
            gameData={gameData}
            title={`ตัวอย่าง: ${CLASS_NAMES[trial.classId]}`}
            subtitle={`${trial.waves} เวฟแรกของชั้น ${trial.floor}`}
            enemyLevel={trial.floor * 2}
            onFinished={noop}
            programSource={trial.program}
            waveTotal={trial.waves}
          />
        </div>
      )}
    </section>
  );
}
