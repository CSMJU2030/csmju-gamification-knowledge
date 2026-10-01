'use client';

/**
 * เอดิเตอร์ BloxCode — บล็อกลากวาง + โค้ด Python ของโปรแกรม turn() (ย้ายจาก pages/BloxCodePage.tsx เดิม)
 *
 * กฎที่ไฟล์นี้ยึดตาม schema.ts
 *   1. state มีชุดเดียวคือ `source` — บล็อกคือภาพฉายของ AST ที่ parse จากมัน
 *      ทุกการแก้บล็อกจึงจบด้วย toPython(AST ใหม่) แล้วส่งกลับขึ้นไปทาง onSourceChange
 *   2. parser/printer/validate มาจาก '@tower/engine/lang' ตัวเดียวกับเซิร์ฟเวอร์
 *   3. ตรวจฝั่งนี้ไว้ให้เห็นผลทันทีเท่านั้น คนตัดสินจริงคือ PATCH /programs/current
 *
 * ต่างจากของเดิม: source ถือไว้ที่หน้า (controlled) ไม่ใช่ในเอดิเตอร์
 * เพราะหน้าต้องใช้มันทำสามอย่างที่เอดิเตอร์ไม่ควรรู้จัก — บันทึก · เตือนก่อนออกจากหน้า · ใส่โปรแกรมตั้งต้นจากโจทย์
 * ไฟล์นี้ถูกโหลดด้วย next/dynamic จากหน้า /program เท่านั้น ล่ามทั้งตัวจึงไม่เข้า JS แรกเข้าของหน้าอื่น
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  describeSkillById,
  parse,
  preferredSkillName,
  toPython,
  validate,
  type CmpOp,
  type Expr,
  type Feature,
  type Program as Ast,
  type Stmt,
} from '@tower/engine/lang';
import { Alert } from '@/components/feedback';
import { CloseIcon, InfoIcon, Modal, Tabs, cardClass, primaryButtonClass, secondaryButtonClass } from '@/csmju';
import {
  BLOCK_CATALOG,
  COMMENT_NOTICE_KEY,
  HIGHLIGHT_FADE_MS,
  TAP_TO_PLACE_HINT_TH,
  canSwitchToBlocks,
  groupErrors,
  type DragPayload,
  type DropSlot,
  type GroupedError,
  type StmtPath,
  type ViewMode,
} from './schema';
import {
  attachElse,
  decodePath,
  decodeSlot,
  detachElse,
  encodePath,
  insertAt,
  moveStmt,
  removeAt,
  replaceAt,
  stmtAt,
} from './ast';
import { applyHole, localsInScope, normalizeCast, type HoleTarget, type SkillOption } from './holes';
import { useBlockDrag, type DropKind } from './useBlockDrag';
import type { Program, ServerRejection } from './program-api';
import BlockCanvas from './BlockCanvas';
import Palette from './Palette';
import HoleMenu from './HoleMenu';
import CodeEditor from './CodeEditor';
import ErrorPanel from './ErrorPanel';
import SkillsCard from './SkillsCard';
import './blox.css';

/** หน่วงก่อนตรวจซ้ำ — พิมพ์รัว ๆ ไม่ควรกระพริบรายการข้อผิดพลาดทุกตัวอักษร */
const CHECK_DELAY_MS = 180;

/**
 * หลังแตะบล็อกเพื่อ "เลือกไว้" ช่องวางทุกช่องจะกางออกเป็นปุ่มสูง 44px ทันที
 * บนมือถือ click สังเคราะห์ที่ตามหลัง touchend อาจตกลงบนช่องที่เพิ่งกางมาใต้นิ้วพอดี
 * แล้ววางบล็อกทั้งที่ผู้เล่นยังไม่ได้เลือกที่ — จึงไม่รับการแตะช่องในช่วงสั้น ๆ หลังเลือก
 */
const ARM_GUARD_MS = 250;

const VIEW_TABS: { id: ViewMode; label: string }[] = [
  { id: 'blocks', label: 'บล็อก' },
  { id: 'code', label: 'โค้ด Python' },
];

interface Notice {
  tone: 'error' | 'info';
  text: string;
}

export interface BloxEditorProps {
  /** ข้อมูลจาก GET /programs/current — ใช้ไวยากรณ์ที่ปลดล็อกกับสกิลที่ใช้ได้ */
  program: Program;
  source: string;
  onSourceChange: (next: string) => void;
  /** ผลที่เซิร์ฟเวอร์ปฏิเสธตอนบันทึกล่าสุด (หน้าล้างเองเมื่อ source เปลี่ยน) */
  server: ServerRejection | null;
  /** ปุ่มบันทึก + ป้ายสถานะ — วางชิดขวาในแถบเครื่องมือของการ์ดตามมาตรฐานข้อ 5.2 */
  actions?: ReactNode;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export default function BloxEditor({ program: meta, source, onSourceChange, server, actions }: BloxEditorProps) {
  const [view, setView] = useState<ViewMode>('blocks');
  /**
   * ถาดบล็อกเปิดอยู่บนจอกว้าง แต่ปิดไว้บนมือถือ (PM สั่งแก้ 19 ก.ย. 2026)
   * เหตุผล: บนมือถือถาดกินพื้นที่เต็มหน้าจอแรกทั้งหน้า โปรแกรมของผู้เล่นเลยตกไปอยู่ใต้ฉาก
   * ถาดเป็นเครื่องมือที่เปิดเมื่อจะหยิบของ ไม่ใช่สิ่งแรกที่ต้องเห็น
   * (ไฟล์นี้โหลดแบบ ssr:false จึงอ่าน window ตอนสร้าง state ได้โดยไม่มีปัญหา hydration)
   */
  const [paletteOpen, setPaletteOpen] = useState(() => window.innerWidth >= 640);
  const [armed, setArmedState] = useState<DragPayload | null>(null);
  const [hole, setHole] = useState<HoleTarget | null>(null);
  const [askComment, setAskComment] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [flashLine, setFlashLine] = useState<number | null>(null);
  const [jump, setJump] = useState<{ line: number; nonce: number } | null>(null);
  const [errors, setErrors] = useState<GroupedError[]>([]);
  const [checking, setChecking] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);
  const armedAt = useRef(0);

  const setArmed = useCallback((next: DragPayload | null | ((prev: DragPayload | null) => DragPayload | null)) => {
    armedAt.current = Date.now();
    setArmedState(next);
  }, []);

  const say = useCallback((text: string, tone: Notice['tone'] = 'error') => setNotice({ tone, text }), []);

  // ข้อความแจ้งเรื่องการแก้บล็อกหมดความหมายทันทีที่โปรแกรมเปลี่ยน — ไม่ต้องให้ผู้เล่นกดปิดเอง
  useEffect(() => {
    setNotice(null);
  }, [source]);

  /**
   * parse ทุกครั้งที่ source เปลี่ยน (ไม่หน่วง) เพราะบล็อกบนจอวาดจาก AST นี้โดยตรง —
   * หน่วง parse = บล็อกขยับช้ากว่านิ้ว ส่วนที่หน่วงได้คือ "รายการข้อผิดพลาด" เท่านั้น
   */
  const parsed = useMemo(() => parse(source), [source]);
  const ast = parsed.program;

  /** ?? [] เผื่อเซิร์ฟเวอร์รุ่นที่ยังไม่ส่งฟิลด์นี้ — หน้าจอต้องขึ้น ไม่ใช่จอขาว */
  const features = useMemo(() => new Set((meta.unlockedFeatures ?? []) as Feature[]), [meta.unlockedFeatures]);
  const skillIds = useMemo(() => (meta.availableSkills ?? []).map((s) => s.id), [meta.availableSkills]);

  const skills = useMemo<SkillOption[]>(
    () =>
      (meta.availableSkills ?? []).map((s) => ({
        id: s.id,
        // ชื่อที่เขียนใน cast() ได้ — ให้ engine เลือกชื่อสั้นเอง (ของเดิมตัด prefix เอง ซึ่งพังเมื่อชื่อสั้นชนกัน)
        codeName: preferredSkillName(s.id),
        nameTh: s.nameTh,
        mpCost: s.mpCost,
        aoe: s.aoe,
        // สร้างจากค่าของ engine ชุดเดียวกับตัวรบ (ไม่ใช่ข้อความที่พิมพ์ไว้ในหน้าเว็บ)
        ...(describeSkillById(s.id) ?? { kindTh: '', effectTh: '', targetTh: '', descTh: '' }),
      })),
    [meta.availableSkills],
  );

  // ------------------------------------------------------- ตรวจโปรแกรม (หน่วงเล็กน้อย)
  useEffect(() => {
    setChecking(true);
    const timer = window.setTimeout(() => {
      const result = parse(source);
      if (!result.program) {
        setErrors(groupErrors(result.errors));
      } else {
        setErrors(groupErrors(validate(result.program, { features, availableSkills: skillIds }).errors));
      }
      setChecking(false);
    }, CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [source, features, skillIds]);

  // ------------------------------------------------------------------ แก้โปรแกรม
  /** ทางออกทางเดียวของการแก้ AST — แปลงกลับเป็นข้อความเสมอ (กฎข้อ 1) */
  const commit = useCallback((next: Ast) => onSourceChange(toPython(next)), [onSourceChange]);

  const isAoe = useCallback((codeName: string) => skills.some((s) => s.codeName === codeName && s.aoe), [skills]);

  const placeNew = useCallback(
    (blockId: string, slot: DropSlot) => {
      if (!ast) return;
      const def = BLOCK_CATALOG.find((b) => b.id === blockId);
      if (!def) return;
      if (def.needs && !features.has(def.needs)) {
        say('บล็อกนี้ยังไม่ปลดล็อก');
        return;
      }
      let stmt: Stmt = def.make();
      // cast ที่เพิ่งสร้างยังไม่มีชื่อสกิล — ใส่สกิลแรกที่ใช้ได้ให้เลย จะได้ไม่เจอ ValueError ทันที (schema.ts §3)
      if (blockId === 'cast' && stmt.kind === 'expr' && stmt.value.kind === 'call') {
        const first = skills[0];
        if (!first) {
          say('ยังไม่มีสกิลที่ใช้ได้ — อัพเลเวลก่อนจึงจะใช้บล็อก cast ได้');
          return;
        }
        stmt = applyHole(stmt, { at: 'arg', index: 0 }, { kind: 'str', value: first.codeName, line: 0, col: 0 });
        stmt = normalizeCast(stmt, isAoe);
      }
      commit(insertAt(ast, slot, stmt));
    },
    [ast, commit, features, isAoe, say, skills],
  );

  const dropElse = useCallback(
    (path: StmtPath, index: number) => {
      if (!ast) return;
      if (!features.has('if_else')) {
        say('บล็อก else ยังไม่ปลดล็อก');
        return;
      }
      const res = attachElse(ast, path, index);
      if (!res.ok) {
        say('บล็อก if นี้มี else อยู่แล้ว', 'info');
        return;
      }
      commit(res.program);
    },
    [ast, commit, features, say],
  );

  const handleDrop = useCallback(
    (payload: DragPayload, mode: DropKind, key: string) => {
      setArmed(null);
      if (!ast) return;
      if (mode === 'else') {
        const cut = key.lastIndexOf('#');
        dropElse(decodePath(key.slice(0, cut)), Number(key.slice(cut + 1)));
        return;
      }
      const slot = decodeSlot(key);
      if (payload.from === 'palette') placeNew(payload.blockId, slot);
      else commit(moveStmt(ast, { path: payload.path, index: payload.index }, slot));
    },
    [ast, commit, dropElse, placeNew, setArmed],
  );

  /** เลือก/เลิกเลือกของไว้รอวาง — แตะของเดิมซ้ำ = ยกเลิก */
  const toggleArm = useCallback(
    (payload: DragPayload) => {
      setArmed((prev) => {
        if (!prev) return payload;
        if (prev.from === 'palette' && payload.from === 'palette' && prev.blockId === payload.blockId) return null;
        if (
          prev.from === 'canvas' &&
          payload.from === 'canvas' &&
          prev.index === payload.index &&
          encodePath(prev.path) === encodePath(payload.path)
        ) {
          return null;
        }
        return payload;
      });
    },
    [setArmed],
  );

  /**
   * แตะสั้น ๆ บนตัวบล็อก = เลือกไว้รอวาง (ทางเลือกแทนการลาก)
   * การแตะที่โดน <button> ข้างในบล็อก (ช่องค่า · ปุ่มจับ · บล็อกในถาด) ปล่อยให้ onClick ของปุ่มนั้นจัดการ
   * ไม่งั้นการแตะครั้งเดียวจะถูกนับสองครั้ง (เลือกแล้วเลิกเลือกทันที หรือเมนูเปิดซ้อน)
   */
  const handleTap = useCallback(
    (payload: DragPayload, target: EventTarget | null) => {
      if (target instanceof Element && target.closest('button')) return;
      toggleArm(payload);
    },
    [toggleArm],
  );

  const { view: dragView, start: startDrag } = useBlockDrag({
    containerRef: canvasRef,
    onDrop: handleDrop,
    onTap: handleTap,
  });

  const onSlotTap = useCallback(
    (slot: DropSlot) => {
      if (!armed || !ast) return;
      if (Date.now() - armedAt.current < ARM_GUARD_MS) return;
      setArmed(null);
      if (armed.from === 'palette') placeNew(armed.blockId, slot);
      else commit(moveStmt(ast, { path: armed.path, index: armed.index }, slot));
    },
    [armed, ast, commit, placeNew, setArmed],
  );

  const onElseTap = useCallback(
    (path: StmtPath, index: number) => {
      setArmed(null);
      dropElse(path, index);
    },
    [dropElse, setArmed],
  );

  const onDelete = useCallback(
    (path: StmtPath, index: number) => {
      if (!ast) return;
      setArmed(null);
      commit(removeAt(ast, path, index));
    },
    [ast, commit, setArmed],
  );

  const onDeleteElse = useCallback(
    (path: StmtPath, index: number) => {
      if (!ast) return;
      commit(detachElse(ast, path, index));
    },
    [ast, commit],
  );

  const onPick = useCallback(
    (pick: Expr | CmpOp) => {
      if (!ast || !hole) return;
      const current = stmtAt(ast, hole.path, hole.index);
      if (!current) {
        setHole(null);
        return;
      }
      const next = normalizeCast(applyHole(current, hole.where, pick), isAoe);
      commit(replaceAt(ast, hole.path, hole.index, next));
      setHole(null);
    },
    [ast, commit, hole, isAoe],
  );

  const closeHole = useCallback(() => setHole(null), []);

  // Esc = ยกเลิกของที่เลือกไว้รอวาง (ทางออกของคีย์บอร์ด — แถบ "กำลังวาง" อาจเลื่อนพ้นจอไปแล้ว)
  useEffect(() => {
    if (!armed || hole || askComment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArmed(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [armed, hole, askComment, setArmed]);

  // ------------------------------------------------------------------ สลับมุมมอง
  const switchView = useCallback(
    (next: ViewMode) => {
      if (next === view) return;
      if (next === 'blocks') {
        if (!canSwitchToBlocks(ast !== null)) {
          say('โค้ดยังมีข้อผิดพลาดจึงวาดเป็นบล็อกไม่ได้ — แก้ตามรายการในแผงข้อผิดพลาดก่อน');
          return;
        }
        let warned = true;
        try {
          warned = window.localStorage.getItem(COMMENT_NOTICE_KEY) !== null;
        } catch {
          warned = true; // localStorage ใช้ไม่ได้ → ไม่กวนผู้เล่นซ้ำ ๆ ทุกครั้ง
        }
        if (!warned) {
          setAskComment(true);
          return;
        }
      }
      setArmed(null);
      setNotice(null);
      setView(next);
    },
    [ast, say, setArmed, view],
  );

  const confirmComment = useCallback(() => {
    try {
      window.localStorage.setItem(COMMENT_NOTICE_KEY, '1');
    } catch {
      // เตือนซ้ำได้ ไม่ใช่เรื่องคอขาดบาดตาย
    }
    setAskComment(false);
    setArmed(null);
    setNotice(null);
    setView('blocks');
  }, [setArmed]);

  const closeComment = useCallback(() => setAskComment(false), []);

  // ------------------------------------------------------------------ กระโดดหาบรรทัด
  const jumpToLine = useCallback(
    (line: number) => {
      if (view === 'blocks') {
        const el = canvasRef.current?.querySelector(`[data-line="${line}"]`);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
          setFlashLine(line);
          window.setTimeout(() => setFlashLine(null), HIGHLIGHT_FADE_MS);
          return;
        }
      }
      setArmed(null);
      setView('code');
      setJump({ line, nonce: Date.now() });
    },
    [setArmed, view],
  );

  // ------------------------------------------------------------------ เรนเดอร์
  const errorLines = useMemo(() => {
    const s = new Set<number>(errors.map((e) => e.line));
    for (const e of server?.errors ?? []) s.add(e.line);
    return s;
  }, [errors, server]);

  const locals = hole && ast ? localsInScope(ast, hole.path, hole.index) : [];
  const armedLabel = armed
    ? armed.from === 'palette'
      ? (BLOCK_CATALOG.find((b) => b.id === armed.blockId)?.label ?? armed.blockId)
      : 'บล็อกที่เลือก'
    : '';

  return (
    <div className="blox-root grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
      {/*
        การ์ดมาตรฐานแต่ไม่ตัดขอบล้น (overflow-hidden ของ cardClass)
        เพราะถาดกับแถบ "กำลังวาง" ต้อง sticky ตามหน้าได้ — overflow-hidden ทำให้ sticky ไม่ทำงาน
      */}
      <div className={`${cardClass.replace('overflow-hidden', '')} min-w-0`}>
        <div className="flex flex-col-reverse gap-x-4 gap-y-3 rounded-t-xl border-b border-outline-variant/40 px-4 pt-3 sm:flex-row sm:items-end sm:justify-between md:px-5">
          <div className="-mb-px min-w-0">
            <Tabs items={VIEW_TABS} value={view} onChange={switchView} label="มุมมองของโปรแกรม" idPrefix="blox-view" />
          </div>
          {actions && (
            <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end sm:pb-2">{actions}</div>
          )}
        </div>

        {notice && (
          <div className="px-4 pt-4 md:px-5">
            <Alert
              tone={notice.tone}
              action={
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-primary-container md:min-h-9 md:min-w-9"
                  aria-label="ปิดข้อความนี้"
                  onClick={() => setNotice(null)}
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              }
            >
              {notice.text}
            </Alert>
          </div>
        )}

        <div className={`grid gap-4 p-4 md:p-5 ${view === 'blocks' ? 'lg:grid-cols-[13rem_minmax(0,1fr)]' : ''}`}>
          {view === 'blocks' && (
            <Palette
              unlocked={features}
              armedId={armed?.from === 'palette' ? armed.blockId : null}
              open={paletteOpen}
              onToggle={() => setPaletteOpen((o) => !o)}
              onStartDrag={startDrag}
              onArm={(blockId) => toggleArm({ from: 'palette', blockId })}
            />
          )}

          <div
            ref={canvasRef}
            role="tabpanel"
            id={`blox-view-panel-${view}`}
            aria-labelledby={`blox-view-${view}`}
            className="min-w-0"
          >
            {armed && (
              <div
                className="sticky top-16 z-[5] mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary-container/40 bg-surface-container-lowest px-3 py-2 shadow-sm lg:top-20"
                role="status"
              >
                <span className="min-w-0 flex-1 text-body-md text-on-surface">
                  กำลังวาง{' '}
                  <code lang="en" className="font-mono font-semibold text-primary-container">
                    {armedLabel}
                  </code>{' '}
                  —{' '}
                  {armed.from === 'palette' && armed.blockId === 'else'
                    ? 'แตะปุ่ม + else บนบล็อก if ที่ต้องการ'
                    : 'แตะช่อง "วางตรงนี้" ที่ต้องการ'}
                </span>
                <button type="button" className={secondaryButtonClass} onClick={() => setArmed(null)}>
                  ยกเลิก
                </button>
              </div>
            )}

            {view === 'blocks' ? (
              ast ? (
                <>
                  <BlockCanvas
                    program={ast}
                    skills={skills}
                    armed={armed}
                    drag={dragView}
                    onStartDrag={startDrag}
                    onArm={toggleArm}
                    onSlotTap={onSlotTap}
                    onElseTap={onElseTap}
                    onHoleTap={setHole}
                    onDelete={onDelete}
                    onDeleteElse={onDeleteElse}
                    flashLine={flashLine}
                    errorLines={errorLines}
                  />
                  <p className="mt-4 flex items-start gap-2 text-body-md text-on-surface-variant">
                    <InfoIcon className="mt-1 h-4 w-4 shrink-0" />
                    <span>{TAP_TO_PLACE_HINT_TH} หรือลากบล็อกก็ได้ · แตะค่าในบล็อกเพื่อเปลี่ยน</span>
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-outline-variant p-4">
                  <p className="text-body-md text-on-surface-variant">
                    โค้ดยังมีข้อผิดพลาด จึงวาดเป็นบล็อกไม่ได้ — กลับไปมุมมองโค้ด Python เพื่อแก้ตามแผงข้อผิดพลาด
                  </p>
                  <button type="button" className={secondaryButtonClass} onClick={() => setView('code')}>
                    ไปมุมมองโค้ด Python
                  </button>
                </div>
              )
            ) : (
              <CodeEditor
                source={source}
                onChange={onSourceChange}
                jump={jump}
                errorLines={errorLines}
              />
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        <ErrorPanel id="blox-errors" errors={errors} server={server} checking={checking} onJump={jumpToLine} />
        <SkillsCard skills={skills} canCast={features.has('string')} />
      </div>

      {hole && ast && (
        <HoleMenu hole={hole} locals={locals} skills={skills} onPick={onPick} onClose={closeHole} />
      )}

      <Modal
        open={askComment}
        title="คอมเมนต์ข้างใน turn() จะหายไป"
        onClose={closeComment}
        footer={
          <>
            <button type="button" className={secondaryButtonClass} onClick={closeComment}>
              อยู่ที่มุมมองโค้ดต่อ
            </button>
            <button type="button" className={primaryButtonClass} onClick={confirmComment}>
              เข้าใจแล้ว ไปมุมมองบล็อก
            </button>
          </>
        }
      >
        <p>
          มุมมองบล็อกจัดรูปแบบโค้ดใหม่ทุกครั้งที่คุณแก้บล็อก คอมเมนต์ที่เขียนไว้
          <strong className="text-on-surface"> ข้างในฟังก์ชัน turn() </strong>
          จึงหายไป (คอมเมนต์ที่อยู่บนสุดของไฟล์ยังอยู่) ข้อความนี้จะแสดงครั้งเดียวเท่านั้น
        </p>
      </Modal>

      {dragView && (
        <div
          className="blox-ghost"
          style={{ transform: `translate3d(${dragView.x}px, ${dragView.y}px, 0)` }}
          aria-hidden="true"
        >
          <span>{dragView.label}</span>
        </div>
      )}
    </div>
  );
}
