'use client';

/**
 * ตัวเล่นฉากจาก event log — การ์ดเวที (canvas) + ปุ่มควบคุม + แถบสถานะ + บันทึกการรบ + แผงโค้ด
 * (แทน client/src/battle/BattleReplay.tsx + BattleStage.tsx)
 *
 * ใช้ตัวเดียวกันทั้งการรบปกติและการดวล (รอบ 2W §5) — ต่างกันแค่ DuelSides ที่ส่งเข้ามา
 * ถ้าแยกเป็นสองตัว ทุกครั้งที่เวทีเปลี่ยนต้องตามแก้สองที่ และมันจะเพี้ยนกันในวันที่ไม่ได้มอง
 *
 * หน้าเพจโหลดไฟล์นี้ด้วย next/dynamic (ssr:false) เท่านั้น — renderer + sprites ≈ 140KB
 * ต้องไม่เข้า JS แรกเข้าของหน้าอื่น (G0 ข้อ 8)
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import {
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  SkipIcon,
  StatusBadge,
  cardClass,
  secondaryButtonClass,
} from '@/csmju';
import { Alert } from '@/components/feedback';
import { api } from '@/lib/api/client';
import type { Character, CombatEvent, GameData, Program } from '@/lib/api/types';
import { useApi } from '@/lib/api/use-api';
import BattleCodePanel from './BattleCodePanel';
import BattleHud from './BattleHud';
import BattleLog from './BattleLog';
import { BattleDirector, MAX_WAVE } from './director';
import type { DirectorCtx, DuelSides, StageSkill } from './director';
import { STAGE_CANVAS_W, SceneRenderer } from './renderer';
import { SpriteCache, loadSpriteSheet } from './spriteCache';
import { STAGE_ASPECT, STAGE_BACKDROP } from './stage-frame';

export interface BattlePlayerProps {
  events: CombatEvent[];
  /** ตัวละครก่อนรบ — HP/MP ตั้งต้นของฝั่งผู้เล่น (ผลหลังรบอยู่ที่หน้าเพจ) */
  character: Character;
  gameData: GameData | null;
  /** หัวการ์ดเวที เช่น "ฉากการรบ" / "ดวลกับ …" */
  title: string;
  /** บรรทัดรองบนหัวการ์ด — เว้นไว้ = "เวฟ x/10" ตามเวฟที่กำลังเล่น */
  subtitle?: string;
  /** เลเวลที่แสดงบนกล่องศัตรู */
  enemyLevel: number;
  /** หัวข้อฝั่งตรงข้ามในแถบสถานะ */
  enemyHeading?: string;
  /** ใส่ = ฉากดวล (ดู DuelSides) */
  duel?: DuelSides;
  /** เปิดมาที่สถานะจบแล้ว (กลับมาดูผลซ้ำ) — ไม่เล่นใหม่เองและไม่แจ้ง onFinished */
  startFinished?: boolean;
  /** ฉากจบรอบแรก — `skipped` = ผู้ใช้กดข้ามไปผลลัพธ์ */
  onFinished: (how: 'played' | 'skipped') => void;
  /**
   * ข้ามไปผลลัพธ์ได้ไหม (playtest รอบ A ข้อ 6) — false = ครั้งแรกที่จุดนี้ ต้องดูจนจบ เร่งได้ถึง 2×
   * ดูจบหนึ่งรอบแล้วปลดให้ข้าม/4× ได้ในการเล่นซ้ำ · ค่าเริ่มต้น true (เช่นฉากดวล)
   */
  canSkip?: boolean;
}

/** ความเร็วที่เลือกได้ — ครั้งแรกที่ต้องดูจนจบจำกัดที่ 2× ให้ยังตามทันว่าโค้ดทำอะไร */
const SPEEDS_MUST_WATCH = [1, 2] as const;
const SPEEDS_ALL = [1, 2, 4] as const;
type Speed = (typeof SPEEDS_ALL)[number];

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduced(cb: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/** คีย์ลัดทำงานเฉพาะตอนโฟกัสอยู่ในเนื้อหาหน้า และไม่ขโมยปุ่มจากช่องกรอก/กล่องโต้ตอบ */
function shortcutAllowed(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return false;
  if (document.querySelector('[aria-modal="true"]')) return false;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="tablist"], [role="slider"]')) {
    return false;
  }
  const active = document.activeElement;
  return !active || active === document.body || !!active.closest('#main-content');
}

export default function BattlePlayer({
  events,
  character,
  gameData,
  title,
  subtitle,
  enemyLevel,
  enemyHeading = 'ศัตรู',
  duel,
  startFinished: startFinishedProp = false,
  onFinished,
  canSkip = true,
}: BattlePlayerProps) {
  // อ่านครั้งเดียวตอนเปิด — หน้าเพจพลิกค่าเป็น true หลังดูจบ ถ้าอ่านสดจะสร้างฉากใหม่ซ้ำโดยเปล่าประโยชน์
  const [startFinished] = useState(startFinishedProp);
  const ctx = useMemo<DirectorCtx>(() => {
    const merged = new Map<string, StageSkill>();
    for (const sk of gameData?.skills ?? []) merged.set(sk.id, sk);
    for (const sk of character.skills ?? []) if (!merged.has(sk.id)) merged.set(sk.id, sk);
    return {
      username: character.displayName,
      classId: character.classId,
      // การดวลขยายเลือดทั้งสองฝ่ายด้วย balance.duelHpMult — เลขในหน้าตัวละครใช้ไม่ได้
      maxHp: duel ? duel.selfMaxHp : character.derived.maxHp,
      maxMp: character.derived.maxMp,
      skills: [...merged.values()],
      ...(duel ? { duel } : {}),
    };
  }, [gameData, character, duel]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [runId, setRunId] = useState(0);
  const [playing, setPlaying] = useState(!startFinished);
  const [speed, setSpeed] = useState<Speed>(1);
  const reduced = usePrefersReducedMotion();

  /*
   * director ตัวเดียวต่อหนึ่งรอบการเล่น — ผูกกับ events และ runId (ปุ่มเล่นซ้ำ) เท่านั้น
   * ถ้าผูกกับ ctx ด้วย เวลา game-data โหลดเสร็จทีหลังจะสร้างใหม่ = ฉากเริ่มนับหนึ่ง
   * `live` กันไม่ให้ skip() ตอนสร้างไปสั่ง re-render ระหว่าง render
   */
  const dir = useMemo(() => {
    let live = false;
    const d = new BattleDirector(events, ctxRef.current, () => {
      if (live) bump();
    });
    if (startFinished && runId === 0) d.skip();
    live = true;
    return d;
  }, [events, runId, startFinished]);

  useEffect(() => {
    dir.updateCtx(ctx);
  }, [dir, ctx]);
  // ต้องตั้งก่อนลูปเริ่ม advance เฟรมแรก (effect รันตามลำดับที่ประกาศ)
  useEffect(() => {
    dir.reduced = reduced;
  }, [dir, reduced]);

  // ---- แจ้งหน้าเพจเมื่อฉากรอบแรกจบ (รอบเล่นซ้ำไม่แจ้ง — หน้ามีผลแสดงอยู่แล้ว) ----
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const howRef = useRef<'played' | 'skipped'>('played');
  const reportedRef = useRef(false);
  const finished = dir.done;
  useEffect(() => {
    if (!finished || reportedRef.current || startFinished || runId !== 0) return;
    reportedRef.current = true;
    onFinishedRef.current(howRef.current);
  }, [finished, startFinished, runId]);

  // ดูจบหนึ่งรอบแล้ว (หรือเปิดมาที่สถานะจบ) = ปลดล็อกปุ่มข้ามและ 4× สำหรับการเล่นซ้ำ
  const [watchedOnce, setWatchedOnce] = useState(startFinished);
  useEffect(() => {
    if (finished && !watchedOnce) setWatchedOnce(true);
  }, [finished, watchedOnce]);
  const skipAllowed = canSkip || watchedOnce;
  const speeds: readonly Speed[] = skipAllowed ? SPEEDS_ALL : SPEEDS_MUST_WATCH;

  // ---- canvas: โหลดสไปรต์ · ตั้งขนาดตามกรอบ · ลูป requestAnimationFrame ----
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheRef = useRef<SpriteCache | null>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const playingRef = useRef(playing);
  const speedRef = useRef<number>(speed);
  playingRef.current = playing;
  speedRef.current = speed;
  if (!cacheRef.current) cacheRef.current = new SpriteCache();
  const [spritesMissing, setSpritesMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSpriteSheet().then(({ sheet, missing }) => {
      if (cancelled) return;
      cacheRef.current?.setSheet(sheet);
      setSpritesMissing(missing);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // ความละเอียดภายในกว้างคงที่ ความสูงตามอัตราส่วนจริงของกรอบ (4:3 / 16:9) — renderer ตัด/ต่อฉากเอง
    const fit = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;
      const want = Math.round((STAGE_CANVAS_W * h) / w);
      if (canvas.width !== STAGE_CANVAS_W) canvas.width = STAGE_CANVAS_W;
      if (canvas.height !== want) canvas.height = want;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cache = cacheRef.current;
    if (!canvas || !cache) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    if (!rendererRef.current) rendererRef.current = new SceneRenderer(cache);
    const renderer = rendererRef.current;
    renderer.fontFamily = window.getComputedStyle(canvas).fontFamily || 'sans-serif';

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // จำกัด dt กันกระโดดตอนสลับแท็บ
      const dt = Math.min(80, now - last);
      last = now;
      // หยุดอยู่ = นาฬิกาฉากหยุดทั้งหมด (ท่าหายใจ ตัวเลขลอย) · จบแล้วยังหายใจต่อได้ถ้าไม่ได้ลดการเคลื่อนไหว
      if (dir.done ? !dir.reduced : playingRef.current) dir.advance(dt * speedRef.current);
      renderer.draw(g, dir, canvas.width / (canvas.clientWidth || canvas.width));
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [dir]);

  // ---- โปรแกรมของผู้เล่นสำหรับแผงโค้ด ----
  const program = useApi((signal) => api.get<Program>('/programs/current', undefined, signal), []);
  /*
   * การรบนี้ขับด้วยโปรแกรมจริงไหม — ดูว่ามี event ของฝั่งผู้เล่นที่ส่ง line มาบ้างหรือเปล่า
   * ถ้าไม่มีต้องบอกตรง ๆ ห้ามเดาว่าเป็นการกระทำสำรอง เพราะจะสอนผิดว่าโค้ดเขาไม่ทำงาน
   */
  const programDriven = useMemo(
    () => events.some((ev) => ev.actorName === character.displayName && ev.line !== undefined),
    [events, character.displayName],
  );

  // ---- ปุ่มควบคุม (ใช้ร่วมกับคีย์ลัด) ----
  const replay = useCallback(() => {
    howRef.current = 'played';
    setRunId((r) => r + 1);
    setPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (dir.done) replay();
    else setPlaying((p) => !p);
  }, [dir, replay]);

  const step = useCallback(() => {
    dir.stepEvent();
  }, [dir]);

  const skipToEnd = useCallback(() => {
    if (dir.done || !skipAllowed) return;
    howRef.current = 'skipped';
    dir.skip();
  }, [dir, skipAllowed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'ArrowRight' && e.key !== 'Escape') return;
      if (!shortcutAllowed(e)) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      // Space บนปุ่ม/ลิงก์ = กดปุ่มนั้นตามปกติของเบราว์เซอร์ ไม่ใช่เล่น/หยุด
      if (e.key === ' ' && target?.closest('button, a[href], summary, [role="button"]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        if (dir.done) return;
        e.preventDefault();
        step();
      } else {
        if (dir.done || !skipAllowed) return;
        e.preventDefault();
        skipToEnd();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dir, togglePlay, step, skipToEnd, skipAllowed]);

  const play = dir.play;
  const stateBadge = finished
    ? { tone: 'success' as const, text: 'จบแล้ว' }
    : playing
      ? { tone: 'info' as const, text: reduced ? 'กำลังเล่น (ภาพนิ่ง)' : 'กำลังเล่น' }
      : { tone: 'neutral' as const, text: 'หยุดชั่วคราว' };

  return (
    <div className="space-y-6">
      <section className={cardClass} aria-label={`เวที: ${title}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-6">
          <h2 className="font-display text-label-md text-on-surface">
            {title}
            <span className="font-body font-normal text-on-surface-variant tabular-nums">
              {' · '}
              {subtitle ?? `เวฟ ${Math.max(1, play.wave)}/${MAX_WAVE}`}
            </span>
          </h2>
          <StatusBadge tone={stateBadge.tone}>{stateBadge.text}</StatusBadge>
        </div>

        {/* เวทีเกม (G0 ข้อ 5.1) — ภาพล้วน ข้อมูลทุกอย่างในภาพมีเป็นข้อความในแถบสถานะและบันทึกการรบ */}
        <div className={`relative w-full ${STAGE_ASPECT} ${STAGE_BACKDROP}`}>
          <canvas
            ref={canvasRef}
            width={STAGE_CANVAS_W}
            height={720}
            role="img"
            aria-label={`ภาพ${title} — รายละเอียดอยู่ในแถบสถานะและบันทึกการรบด้านล่าง`}
            className="absolute inset-0 block h-full w-full [image-rendering:pixelated]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/40 px-4 py-3 md:px-6">
          <button type="button" className={secondaryButtonClass} onClick={togglePlay}>
            {finished ? (
              <RefreshIcon className="h-4 w-4" />
            ) : playing ? (
              <PauseIcon className="h-4 w-4" />
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
            {finished ? 'เล่นซ้ำ' : playing ? 'หยุด' : 'เล่น'}
          </button>
          <button type="button" className={secondaryButtonClass} onClick={step} disabled={finished}>
            <ChevronRightIcon className="h-4 w-4" />
            เทิร์นถัดไป
          </button>
          {skipAllowed && (
            <button type="button" className={secondaryButtonClass} onClick={skipToEnd} disabled={finished}>
              <SkipIcon className="h-4 w-4" />
              ข้ามไปผลลัพธ์
            </button>
          )}
          <div role="group" aria-label="ความเร็ว" className="flex gap-1">
            {speeds.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={speed === x}
                onClick={() => setSpeed(x)}
                className={`${secondaryButtonClass} min-w-11 tabular-nums ${
                  speed === x ? 'border-primary-container bg-primary-container/10 text-primary-container' : ''
                }`}
              >
                {x}×<span className="sr-only"> ความเร็ว</span>
              </button>
            ))}
          </div>
          <p className="hidden text-label-md text-on-surface-variant lg:ml-auto lg:block">
            คีย์ลัด <kbd className="font-mono">Space</kbd> เล่น/หยุด · <kbd className="font-mono">→</kbd> เทิร์นถัดไป
            {skipAllowed && (
              <>
                {' · '}
                <kbd className="font-mono">Esc</kbd> ข้ามไปผลลัพธ์
              </>
            )}
          </p>
          {!skipAllowed && !finished && (
            <p className="w-full text-label-md text-on-surface-variant">
              ครั้งแรกที่จุดนี้ต้องดูจนจบ — ดูว่าโค้ดของคุณสั่งอะไรในแต่ละเทิร์น (เร่งได้ 2×) · ครั้งต่อไปข้ามได้
            </p>
          )}
        </div>

        {spritesMissing && (
          <div className="border-t border-outline-variant/40 px-4 py-3 md:px-6">
            <Alert tone="info">ยังโหลดภาพตัวละครไม่ได้ — ฉากแสดงกล่องแทนตัวละครชั่วคราว ผลการรบไม่เปลี่ยน</Alert>
          </div>
        )}

        <BattleHud play={play} character={character} enemyLevel={enemyLevel} enemyHeading={enemyHeading} />
      </section>

      {/* บันทึกกับโค้ดวางคู่กันบนจอกว้าง ให้เห็น "เกิดอะไรขึ้น" คู่กับ "บรรทัดไหนสั่ง" พร้อมกัน */}
      <div className="grid gap-6 xl:grid-cols-2">
        <BattleLog lines={play.log} />
        <BattleCodePanel
          source={program.status === 'ready' ? program.data.source : null}
          loadError={program.status === 'error' ? 'โหลดโปรแกรมของคุณไม่สำเร็จ' : null}
          onRetry={program.reload}
          code={play.code}
          programDriven={programDriven}
          finished={finished}
        />
      </div>
    </div>
  );
}
