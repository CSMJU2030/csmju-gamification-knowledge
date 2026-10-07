'use client';

/**
 * ทดลองสู้มอนของโจทย์ด้วยตัวละครตัวอย่าง (docs/design-challenge-monsters.md ข้อ M7) — ส่วนหนึ่งของฟอร์มโจทย์
 *
 * ผู้สอนเลือกอาชีพ + เลเวล + โปรแกรม แล้ว POST /challenges/trials พร้อมมอนในฟอร์ม (ยังไม่บันทึกก็ได้)
 * ไม่บันทึกอะไร ไม่มีรางวัล · ผู้สอนไม่ต้องมีตัวละคร · ตัวเล่นฉากแยก chunk โหลดเมื่อทดลองครั้งแรก (แบบเดียวกับ ClassTrials)
 */
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import {
  CHALLENGE_MONSTER_LIMITS as L,
  CHALLENGE_TRIAL_CLASSES,
  challengeMonsterId,
  type ChallengeTrialClassId,
} from '@tower/engine/challenge';
import { StatusBadge, SwordsIcon, inputClass } from '@/csmju';
import { Alert, Button } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import StageSkeleton from '@/game-stage/battle/StageSkeleton';
import { api, ApiError, userMessage } from '@/lib/api/client';
import type { Character, ChallengeMonsterInput, ChallengeTrial } from '@/lib/api/types';
import { CLASS_NAMES } from '@/lib/game/labels';
import { useGame } from '@/lib/game/session';
import { inputOf, monsterErrors, readableProgramError, splitMonsterDetails, type MonsterDraft } from './_monsters';

const BattlePlayer = dynamic(() => import('@/game-stage/battle/BattlePlayer'), {
  ssr: false,
  loading: () => <StageSkeleton />,
});

const noop = () => {};

/** โปรแกรมของตัวละครตัวอย่าง — โปรแกรมตั้งต้นของโจทย์คือสิ่งที่ผู้เล่นได้ไปเริ่ม จึงเป็นค่าแรกเมื่อมี */
type ProgramMode = 'starter' | 'demo' | 'custom';

/** เลเวลของตัวละครตัวอย่างก่อนผู้สอนตั้งเอง = เลเวลสูงสุดของมอนในฟอร์ม (ช่องที่ยังว่าง/ผิดไม่นับ) */
export function defaultTrialLevel(drafts: readonly MonsterDraft[]): number {
  const levels = drafts.map((d) => Number(d.level)).filter((n) => Number.isInteger(n) && n >= L.levelMin && n <= L.levelMax);
  return levels.length > 0 ? Math.max(...levels) : L.levelMin;
}

/**
 * ตัวละครบนเวที — ตัวเล่นฉากอ่านแค่ชื่อ อาชีพ เลเวล สกิล และหลอด HP/MP จาก Character
 * ชื่อต้องตรงกับ actorName ใน events (heroName) ไม่งั้นแผงโค้ดจับเทิร์นของตัวละครไม่ได้
 */
function stageCharacterOf(t: ChallengeTrial): Character {
  return {
    displayName: t.heroName,
    classId: t.classId,
    level: t.level,
    skills: [],
    derived: { maxHp: t.maxHp, maxMp: t.maxMp },
  } as unknown as Character;
}

interface Ran {
  trial: ChallengeTrial;
  /** มอนที่ใช้ทดลอง — เทียบกับฟอร์มตอนนี้เพื่อบอกว่าผลเก่าแล้ว และให้ HUD รู้เลเวลรายตัว */
  monsters: ChallengeMonsterInput[];
  run: number;
}

export function ChallengeTrialPanel({
  drafts,
  starterSource,
  onMonsterErrors,
}: {
  drafts: MonsterDraft[];
  starterSource: string;
  /** มอนผิด (ตรวจในเครื่องหรือ 400) — ฟอร์มแสดงใต้ช่องของมอนตัวนั้นและพาโฟกัสไป */
  onMonsterErrors: (errors: Record<string, string>) => void;
}) {
  const { gameData } = useGame();
  const hasStarter = starterSource.trim() !== '';
  const [classId, setClassId] = useState<ChallengeTrialClassId>('warrior');
  // ยังไม่ตั้งเอง (null) = ตามเลเวลสูงสุดของมอนในฟอร์มไปเรื่อย ๆ
  const [levelInput, setLevelInput] = useState<string | null>(null);
  const level = levelInput ?? String(defaultTrialLevel(drafts));
  const [mode, setMode] = useState<ProgramMode>(hasStarter ? 'starter' : 'demo');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ level?: string; programSource?: string }>({});
  const [ran, setRan] = useState<Ran | null>(null);

  // ลบโปรแกรมตั้งต้นทิ้งระหว่างทาง → ใช้โปรแกรมตัวอย่างของอาชีพแทน (ไม่ส่งโปรแกรมว่างไปให้ดูเหมือนตั้งใจ)
  const effectiveMode: ProgramMode = mode === 'starter' && !hasStarter ? 'demo' : mode;
  const current = useMemo(() => drafts.map(inputOf), [drafts]);
  const stale = ran !== null && JSON.stringify(ran.monsters) !== JSON.stringify(current);

  const trial = async () => {
    setError(null);
    setFieldErrors({});
    const local = monsterErrors(drafts);
    if (Object.keys(local).length > 0) {
      onMonsterErrors(local);
      setError('แก้มอนตามข้อความใต้ช่องก่อน แล้วค่อยทดลองสู้');
      return;
    }
    const lv = Number(level);
    if (!Number.isInteger(lv) || lv < L.levelMin || lv > L.levelMax) {
      setFieldErrors({ level: `เลเวลต้องเป็นจำนวนเต็ม ${L.levelMin}–${L.levelMax}` });
      return;
    }
    const programSource = effectiveMode === 'starter' ? starterSource : effectiveMode === 'custom' ? custom : undefined;
    setBusy(true);
    try {
      const t = await api.post<ChallengeTrial>('/challenges/trials', {
        monsters: current,
        classId,
        level: lv,
        ...(programSource?.trim() ? { programSource } : {}),
      });
      setRan((prev) => ({ trial: t, monsters: current, run: (prev?.run ?? 0) + 1 }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
        const { monsters, rest } = splitMonsterDetails(e.details);
        if (Object.keys(monsters).length > 0) onMonsterErrors(monsters);
        const program = rest.filter((d) => d.startsWith('programSource:')).map((d) => readableProgramError(d.slice('programSource:'.length)));
        const others = rest.filter((d) => !d.startsWith('programSource:'));
        if (program.length > 0) setFieldErrors({ programSource: program.join(' · ') });
        setError(others.length > 0 ? others.join(' · ') : Object.keys(monsters).length > 0 ? 'แก้มอนตามข้อความใต้ช่องก่อน แล้วค่อยทดลองสู้' : null);
      } else {
        setError(userMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const t = ran?.trial;
  const enemyLevels = useMemo(
    () => Object.fromEntries((ran?.monsters ?? []).map((m, i) => [challengeMonsterId(i + 1, m.archetypeId), m.level])),
    [ran],
  );
  const programHint =
    effectiveMode === 'starter'
      ? 'โปรแกรมตั้งต้นของโจทย์ด้านบน — สิ่งที่ผู้เล่นได้ไปเริ่ม'
      : effectiveMode === 'demo'
        ? 'โปรแกรมตัวอย่างของอาชีพ (ใช้สกิลที่ปลดแล้วที่เลเวลนี้)'
        : 'เขียนเอง เช่น โปรแกรมที่คิดว่านักศึกษาเก่ง ๆ จะเขียน';

  return (
    <section aria-labelledby="challenge-trial-title" className="space-y-4 rounded-lg border border-outline-variant/60 p-4">
      <div>
        <h3 id="challenge-trial-title" className="font-display text-label-md text-on-surface">
          ทดลองสู้
        </h3>
        <p className="mt-1 text-label-sm font-normal text-on-surface-variant">
          ลองมอนในฟอร์มนี้ (ยังไม่ต้องบันทึก) กับตัวละครตัวอย่าง — สเตตัสตามอาชีพและเลเวล ไม่มีอุปกรณ์ ·
          ไม่บันทึกผลและไม่มีรางวัล · ผู้เล่นจริงที่มีของสวมจะแรงกว่านี้
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="อาชีพตัวละครตัวอย่าง">
          <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value as ChallengeTrialClassId)}>
            {CHALLENGE_TRIAL_CLASSES.map((c) => (
              <option key={c} value={c}>
                {CLASS_NAMES[c]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="เลเวลตัวละครตัวอย่าง" error={fieldErrors.level} hint={`${L.levelMin}–${L.levelMax}`}>
          <input
            className={inputClass}
            type="number"
            inputMode="numeric"
            min={L.levelMin}
            max={L.levelMax}
            step={1}
            value={level}
            onChange={(e) => setLevelInput(e.target.value)}
          />
        </FormField>
        <FormField label="โปรแกรมตัวละครตัวอย่าง" error={effectiveMode === 'custom' ? undefined : fieldErrors.programSource} hint={programHint}>
          <select className={inputClass} value={effectiveMode} onChange={(e) => setMode(e.target.value as ProgramMode)}>
            {hasStarter && <option value="starter">โปรแกรมตั้งต้นของโจทย์</option>}
            <option value="demo">โปรแกรมตัวอย่างของอาชีพ</option>
            <option value="custom">เขียนเอง</option>
          </select>
        </FormField>
      </div>
      {effectiveMode === 'custom' && (
        <FormField label="โปรแกรมที่จะทดลอง (BloxCode)" error={fieldErrors.programSource} hint="ต้องมี def turn(): · เว้นว่าง = โปรแกรมตัวอย่างของอาชีพ">
          <textarea
            className={`${inputClass} min-h-36 font-mono`}
            value={custom}
            spellCheck={false}
            placeholder={'def turn():\n    attack(weakest(enemies))'}
            onChange={(e) => setCustom(e.target.value)}
          />
        </FormField>
      )}
      {error && <Alert>{error}</Alert>}
      <Button variant="secondary" loading={busy} onClick={() => void trial()} className="w-full md:w-auto">
        <SwordsIcon className="h-4 w-4" />
        {ran ? 'ทดลองสู้อีกครั้ง' : 'ทดลองสู้'}
      </Button>

      {t && ran && (
        <div className="space-y-3" aria-live="polite">
          <p className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
            <StatusBadge tone={t.result.victory ? 'success' : 'warning'}>{t.result.victory ? 'ตัวละครตัวอย่างชนะ' : 'มอนชนะ'}</StatusBadge>
            <span className="text-on-surface-variant tabular-nums">
              {CLASS_NAMES[t.classId as ChallengeTrialClassId]} เลเวล {t.level} · HP {t.maxHp} · ไม่บันทึกผล
            </span>
          </p>
          {stale && <Alert tone="info">มอนในฟอร์มเปลี่ยนไปหลังทดลองครั้งนี้ — กด &quot;ทดลองสู้อีกครั้ง&quot; เพื่อดูผลของชุดใหม่</Alert>}
          <BattlePlayer
            key={ran.run}
            events={t.result.events}
            character={stageCharacterOf(t)}
            gameData={gameData}
            title="ทดลองสู้"
            subtitle={`${CLASS_NAMES[t.classId as ChallengeTrialClassId]} เลเวล ${t.level} · ไม่มีอุปกรณ์`}
            enemyLevel={Math.max(L.levelMin, ...ran.monsters.map((m) => m.level))}
            enemyLevels={enemyLevels}
            onFinished={noop}
            programSource={t.programSource}
            waveTotal={1}
          />
        </div>
      )}
    </section>
  );
}
