/**
 * พื้นที่ต่อบล็อก — วาดจาก AST ที่ parse ได้ (กฎข้อ 1: บล็อกคือ "ภาพฉาย" ของ source)
 *
 * วิธีวาด: แปลงต้นไม้ AST เป็น "รายการแถวแบน" ก่อน แล้วค่อยเรนเดอร์
 * ทำไมไม่เรนเดอร์ซ้อนกันตามต้นไม้ตรง ๆ: เลขบรรทัดต้องเรียงชิดซ้ายเป็นคอลัมน์เดียว
 * ถ้า DOM ซ้อนตามการเยื้อง เลขบรรทัดจะเลื่อนตามไปด้วยจนอ่านคู่กับมุมมองข้อความไม่ได้
 * แถวแบนยังทำให้ "ช่องหย่อน" ทุกช่องอยู่ระดับเดียวกัน หาเป้าหมายตอนลากง่ายและแม่นกว่า
 */
import type { ReactNode } from 'react';
import {
  exprToPython,
  isElifChain,
  numberLiteral,
  type Expr,
  type Program,
  type Stmt,
} from '@tower/engine/lang';
import { CloseIcon } from '@/csmju';
import {
  TAP_TO_PLACE_HINT_TH,
  type BlockCategory,
  type DragPayload,
  type DropSlot,
  type StmtPath,
} from './schema';
import { canAttachElse, encodePath, encodeSlot, type IfStmt } from './ast';
import { encodeHole, type HoleTarget, type SkillOption } from './holes';
import type { DragView, StartDrag } from './useBlockDrag';

// ----------------------------------------------------------------- แถวที่จะวาด

interface SlotRow {
  t: 'slot';
  key: string;
  depth: number;
  slot: DropSlot;
  /** true = รายการนี้ยังว่าง ต้องบอกผู้เล่นว่าหย่อนอะไรลงไปได้ */
  empty: boolean;
}

interface StmtRow {
  t: 'stmt';
  key: string;
  depth: number;
  line: number;
  path: StmtPath;
  index: number;
  stmt: Stmt;
  /** หัวเงื่อนไข — null คือคำสั่งธรรมดา */
  clause: 'if' | 'elif' | 'else' | null;
  /** คีย์เป้าหมายสำหรับหย่อน else ลงบน if (schema.ts §3) */
  elseKey?: string;
  elseDisabled?: boolean;
}

type Row = SlotRow | StmtRow;

const stmtLine = (s: Stmt): number => s.line;

function pushList(list: Stmt[], path: StmtPath, depth: number, out: Row[]): void {
  const empty = list.length === 0;
  out.push({ t: 'slot', key: `s:${encodeSlot({ parent: path, index: 0 })}`, depth, slot: { parent: path, index: 0 }, empty });
  list.forEach((s, i) => {
    pushStmt(s, path, i, depth, out);
    const slot = { parent: path, index: i + 1 };
    out.push({ t: 'slot', key: `s:${encodeSlot(slot)}`, depth, slot, empty: false });
  });
}

function pushStmt(s: Stmt, path: StmtPath, index: number, depth: number, out: Row[]): void {
  const base = `${encodePath(path)}#${index}`;
  if (s.kind === 'if') {
    const elseKey = base;
    const elseDisabled = !canAttachElse(s);
    let node: IfStmt = s;
    let cPath = path;
    let cIndex = index;
    let clause: 'if' | 'elif' = 'if';
    for (;;) {
      out.push({
        t: 'stmt',
        key: `b:${encodePath(cPath)}#${cIndex}:${clause}`,
        depth,
        line: stmtLine(node),
        path: cPath,
        index: cIndex,
        stmt: node,
        clause,
        elseKey,
        elseDisabled,
      });
      pushList(node.body, [...cPath, { i: cIndex, br: 'body' }], depth + 1, out);
      if (isElifChain(node)) {
        cPath = [...cPath, { i: cIndex, br: 'orelse' }];
        node = node.orelse[0] as IfStmt;
        cIndex = 0;
        clause = 'elif';
        continue;
      }
      break;
    }
    if (node.orelse.length > 0) {
      out.push({
        t: 'stmt',
        key: `b:${encodePath(cPath)}#${cIndex}:else`,
        depth,
        // printer วาง else: ไว้บรรทัดก่อนคำสั่งแรกในสาขานั้นเสมอ
        line: Math.max(0, node.orelse[0].line - 1),
        path: cPath,
        index: cIndex,
        stmt: node,
        clause: 'else',
      });
      pushList(node.orelse, [...cPath, { i: cIndex, br: 'orelse' }], depth + 1, out);
    }
    return;
  }

  out.push({
    t: 'stmt',
    key: `b:${base}`,
    depth,
    line: stmtLine(s),
    path,
    index,
    stmt: s,
    clause: null,
  });
  if (s.kind === 'for') {
    pushList(s.body, [...path, { i: index, br: 'body' }], depth + 1, out);
  }
}

export function buildRows(program: Program): Row[] {
  const out: Row[] = [];
  pushList(program.turn, [], 0, out);
  return out;
}

// ----------------------------------------------------------------- ตัวช่วยแสดงผล

export function categoryOf(s: Stmt): BlockCategory {
  if (s.kind === 'if' || s.kind === 'for') return 'control';
  if (s.kind === 'expr' && s.value.kind === 'call') {
    if (s.value.func === 'cast') return 'magic';
    if (s.value.func === 'attack' || s.value.func === 'defend' || s.value.func === 'wait') {
      return 'action';
    }
  }
  return 'basic';
}

/** ข้อความสั้น ๆ บนเงาที่ลากตามนิ้ว */
export function stmtLabel(s: Stmt): string {
  switch (s.kind) {
    case 'if': return `if ${exprToPython(s.test)}:`;
    case 'for': return `for ${s.target} in ${exprToPython(s.iter)}:`;
    case 'assign': return `${s.target} = ${exprToPython(s.value)}`;
    case 'expr': return exprToPython(s.value);
    case 'pass': return 'pass';
  }
}

// ----------------------------------------------------------------- คอมโพเนนต์

interface Props {
  program: Program;
  skills: SkillOption[];
  /** ของที่ "เลือกไว้" ด้วยการแตะ (ทางเลือกแทนการลาก — schema.ts §5) */
  armed: DragPayload | null;
  drag: DragView | null;
  onStartDrag: StartDrag;
  /** กดปุ่มจับ (ไอคอนหกจุด) — ทางของคีย์บอร์ดในการเลือกบล็อกไว้ย้าย */
  onArm: (payload: DragPayload) => void;
  onSlotTap: (slot: DropSlot) => void;
  onElseTap: (path: StmtPath, index: number) => void;
  onHoleTap: (hole: HoleTarget) => void;
  onDelete: (path: StmtPath, index: number) => void;
  onDeleteElse: (path: StmtPath, index: number) => void;
  /** บรรทัดที่เพิ่งถูกคลิกจากแผงข้อผิดพลาด — กะพริบให้เห็นว่าอยู่ตรงไหน */
  flashLine: number | null;
  /** บรรทัดที่มีข้อผิดพลาด (ทั้งที่ตรวจเองและที่เซิร์ฟเวอร์ส่งมา) */
  errorLines: ReadonlySet<number>;
}

export default function BlockCanvas(props: Props) {
  const { program, armed, drag, errorLines } = props;
  const rows = buildRows(program);
  const placing = armed !== null || drag !== null;
  const elseMode = (armed?.from === 'palette' && armed.blockId === 'else') || drag?.mode === 'else';

  const headerLines = program.header ? program.header.split('\n') : [];
  const defLine = headerLines.length + 1;

  return (
    <div className="blox-prog">
      {headerLines.map((text, i) => (
        <div className="blox-row" key={`h${i}`}>
          <span className={`blox-gut${errorLines.has(i + 1) ? ' is-error' : ''}`}>{i + 1}</span>
          <div className="blox-row-body">
            <span className="blox-comment">{text}</span>
          </div>
        </div>
      ))}
      <div className="blox-row">
        <span className={`blox-gut${errorLines.has(defLine) ? ' is-error' : ''}`}>{defLine}</span>
        <div className="blox-row-body">
          <span className="blk blk--def" data-line={defLine}>def turn():</span>
        </div>
      </div>

      {rows.map((row) =>
        row.t === 'slot' ? (
          <SlotView key={row.key} row={row} placing={placing && !elseMode} drag={drag} onTap={props.onSlotTap} />
        ) : (
          <StmtView key={row.key} row={row} {...props} elseMode={elseMode} />
        ),
      )}
    </div>
  );
}

/**
 * เส้นนำสายตาของการเยื้อง — หนึ่งขีดต่อหนึ่งระดับ
 * บล็อกที่ซ้อนกันต้อง "เห็นว่าอยู่ข้างในอะไร" ตั้งแต่แวบแรก การเว้นวรรคเฉย ๆ ไม่พอ
 */
function Indent({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span className="blox-indent" key={i} aria-hidden="true" />
      ))}
    </>
  );
}

function SlotView({
  row,
  placing,
  drag,
  onTap,
}: {
  row: SlotRow;
  placing: boolean;
  drag: DragView | null;
  onTap: (slot: DropSlot) => void;
}) {
  const key = encodeSlot(row.slot);
  const hover = drag?.mode === 'slot' && drag.hoverKey === key;
  const open = placing || row.empty;
  const cls = `blox-drop${open ? ' is-open' : ''}${hover ? ' is-hover' : ''}${row.empty ? ' is-empty' : ''}${placing ? ' is-placing' : ''}`;
  return (
    <div className="blox-row">
      <span className="blox-gut" />
      <div className="blox-row-body">
        <Indent depth={row.depth} />
        {/* ช่องเป็นปุ่มจริงเฉพาะตอนมีของรอวาง — นอกนั้นเป็นแค่เส้นบาง ๆ ที่ไม่ต้องให้ Tab ผ่าน */}
        {placing ? (
          <button type="button" className={cls} data-slot={key} onClick={() => onTap(row.slot)}>
            วางตรงนี้
          </button>
        ) : (
          <div className={cls} data-slot={key}>
            {row.empty ? 'ยังว่าง — ลากบล็อกมาวาง' : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** ไอคอนจับลาก (หกจุด) — แทนตัวอักษรเบรลล์ของเดิม ซึ่งบางฟอนต์ไม่มี */
function GripIcon() {
  return (
    <svg viewBox="0 0 12 18" width="12" height="18" aria-hidden="true" focusable="false" fill="currentColor">
      <circle cx="3" cy="3" r="1.6" />
      <circle cx="9" cy="3" r="1.6" />
      <circle cx="3" cy="9" r="1.6" />
      <circle cx="9" cy="9" r="1.6" />
      <circle cx="3" cy="15" r="1.6" />
      <circle cx="9" cy="15" r="1.6" />
    </svg>
  );
}

function StmtView({
  row,
  skills,
  armed,
  drag,
  elseMode,
  flashLine,
  errorLines,
  onStartDrag,
  onArm,
  onElseTap,
  onHoleTap,
  onDelete,
  onDeleteElse,
}: Props & { row: StmtRow; elseMode: boolean }) {
  const { stmt, path, index, clause } = row;
  const isElse = clause === 'else';
  const cat = categoryOf(stmt);
  const armedHere =
    armed?.from === 'canvas' && armed.index === index && encodePath(armed.path) === encodePath(path) && !isElse;
  const elseTargetKey = row.elseKey;
  const elseHover = elseMode && drag?.mode === 'else' && drag.hoverKey === elseTargetKey;
  const flash = flashLine !== null && row.line === flashLine;
  const hasError = row.line > 0 && errorLines.has(row.line);
  const label = isElse ? 'else:' : stmtLabel(stmt);

  const payload: DragPayload = { from: 'canvas', path, index };

  return (
    <div className={`blox-row${flash ? ' is-flash' : ''}`}>
      <span className={`blox-gut${hasError ? ' is-error' : ''}`}>{row.line > 0 ? row.line : ''}</span>
      <div className="blox-row-body">
        <Indent depth={row.depth} />
        <div
          role="group"
          aria-label={`บรรทัด ${row.line}: ${label}`}
          className={`blk${isElse ? '' : ' draggable'} blk--${cat}${armedHere ? ' is-armed' : ''}${hasError ? ' is-error' : ''}`}
          data-else={!isElse && elseTargetKey ? elseTargetKey : undefined}
          data-disabled={row.elseDisabled ? '1' : undefined}
          data-line={row.line}
          onPointerDown={isElse ? undefined : (e) => onStartDrag(e, payload, label)}
        >
          {!isElse && (
            <button
              type="button"
              className="blk__grip"
              aria-label={armedHere ? `ยกเลิกการย้าย ${label}` : `ย้ายบล็อก ${label}`}
              aria-pressed={armedHere}
              title="ลากเพื่อย้าย หรือกดเพื่อเลือกแล้วแตะจุดที่จะวาง"
              onClick={() => onArm(payload)}
            >
              <GripIcon />
            </button>
          )}
          <BlockBody row={row} skills={skills} onHoleTap={onHoleTap} />
          {/*
            ปุ่มลบอยู่ "ข้างใน" บล็อก เพื่อให้มันขึ้นบรรทัดใหม่พร้อมบล็อกตอนจอแคบ
            pointerdown ต้องหยุดการกระจาย ไม่งั้นการกดปุ่มจะกลายเป็นการเริ่มลากบล็อก
          */}
          <button
            type="button"
            className="blk-del"
            aria-label={isElse ? 'ลบสาขา else' : `ลบบล็อก ${label}`}
            title={isElse ? 'ลบสาขา else' : 'ลบบล็อกนี้'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => (isElse ? onDeleteElse(path, index) : onDelete(path, index))}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* หย่อน else ลงบนหัว if ได้ — ไฮไลต์ให้เห็นตอนกำลังลาก else มา */}
        {elseMode && !isElse && elseTargetKey && (
          <button
            type="button"
            className={`blk-else-target${elseHover ? ' is-hover' : ''}`}
            disabled={row.elseDisabled}
            onClick={() => onElseTap(path, index)}
          >
            {row.elseDisabled ? 'มี else แล้ว' : '+ else'}
          </button>
        )}

        {armedHere && <span className="blk-armed-tag">{TAP_TO_PLACE_HINT_TH}</span>}
      </div>
    </div>
  );
}

/** เนื้อในบล็อก — ชื่อคำสั่ง (อังกฤษ) + ช่องค่าที่แตะเลือกได้ */
function BlockBody({
  row,
  skills,
  onHoleTap,
}: {
  row: StmtRow;
  skills: SkillOption[];
  onHoleTap: (hole: HoleTarget) => void;
}) {
  const { stmt, path, index, clause } = row;
  const hole = (h: Omit<HoleTarget, 'path' | 'index'>) => <Hole target={{ ...h, path, index }} onTap={onHoleTap} />;

  if (clause === 'else') return <span className="blk__kw">else:</span>;

  if (clause === 'if' || clause === 'elif') {
    const s = stmt as IfStmt;
    return (
      <>
        <span className="blk__kw">{clause}</span>
        <TestBody test={s.test} hole={hole} />
        <span className="blk__punct">:</span>
      </>
    );
  }

  switch (stmt.kind) {
    case 'pass':
      return <span className="blk__kw">pass</span>;

    case 'for':
      return (
        <>
          <span className="blk__kw">for</span>
          <span className="blk__name">{stmt.target}</span>
          <span className="blk__kw">in</span>
          {hole({ kind: 'list', where: { at: 'for-iter' }, text: exprToPython(stmt.iter) })}
          <span className="blk__punct">:</span>
        </>
      );

    case 'assign':
      return (
        <>
          <span className="blk__name">{stmt.target}</span>
          <span className="blk__op">=</span>
          {hole({ kind: 'unit', where: { at: 'assign-value' }, text: exprToPython(stmt.value) })}
        </>
      );

    case 'if':
      // if ถูกจัดการด้วย clause ด้านบนเสมอ — กิ่งนี้มีไว้ให้ switch ครบทุกชนิด
      return <RawExpr e={stmt.test} />;

    case 'expr': {
      const v = stmt.value;
      if (v.kind !== 'call') return <RawExpr e={v} />;
      if (v.func === 'cast') {
        const nameNode = v.args[0];
        const target = v.args[1];
        const skillName = nameNode && nameNode.kind === 'str' ? nameNode.value : null;
        const aoe = skillName !== null && skills.some((s) => s.codeName === skillName && s.aoe);
        return (
          <>
            <span className="blk__fn">cast</span>
            <span className="blk__punct">(</span>
            {skillName !== null
              ? hole({ kind: 'skill', where: { at: 'arg', index: 0 }, text: `"${skillName}"` })
              : nameNode
                ? <RawExpr e={nameNode} />
                : null}
            <span className="blk__punct">,</span>
            {target
              ? hole({ kind: 'unit', where: { at: 'arg', index: 1 }, text: exprToPython(target), allowList: aoe })
              : null}
            <span className="blk__punct">)</span>
          </>
        );
      }
      if (v.func === 'attack' && v.args.length === 1) {
        return (
          <>
            <span className="blk__fn">attack</span>
            <span className="blk__punct">(</span>
            {hole({ kind: 'unit', where: { at: 'arg', index: 0 }, text: exprToPython(v.args[0]) })}
            <span className="blk__punct">)</span>
          </>
        );
      }
      if ((v.func === 'defend' || v.func === 'wait') && v.args.length === 0) {
        return (
          <>
            <span className="blk__fn">{v.func}</span>
            <span className="blk__punct">()</span>
          </>
        );
      }
      return <RawExpr e={v} />;
    }
  }
}

function TestBody({ test, hole }: { test: Expr; hole: (h: Omit<HoleTarget, 'path' | 'index'>) => ReactNode }) {
  if (test.kind !== 'compare') return <RawExpr e={test} />;
  return (
    <>
      {hole({ kind: 'attr', where: { at: 'test-left' }, text: exprToPython(test.left) })}
      {hole({ kind: 'cmpop', where: { at: 'test-op' }, text: test.op })}
      {test.right.kind === 'num'
        ? hole({ kind: 'num', where: { at: 'test-right' }, text: numberLiteral(test.right.value) })
        : hole({ kind: 'attr', where: { at: 'test-right' }, text: exprToPython(test.right) })}
    </>
  );
}

/** นิพจน์ที่เมนูแตะเลือกยังครอบไม่ถึง — อ่านอย่างเดียว ให้ไปแก้ในมุมมองข้อความ */
function RawExpr({ e }: { e: Expr }) {
  return (
    <span className="blk-raw" title="นิพจน์นี้แก้ได้ในมุมมองโค้ด Python">
      {exprToPython(e)}
    </span>
  );
}

/**
 * ช่องค่าเป็น <button> จริง (ของเดิมเป็น span role=button)
 * คลิก/Enter/Space เปิดเมนูผ่าน onClick ทางเดียว — ตัวจับการแตะระดับบล็อกจึงต้องข้ามการแตะที่โดนปุ่ม
 * (ดู handleTap ใน BloxEditor) ไม่งั้นเมนูจะเปิดซ้อนสองครั้ง
 */
function Hole({ target, onTap }: { target: HoleTarget; onTap: (h: HoleTarget) => void }) {
  return (
    <button
      type="button"
      className="blk-hole"
      data-hole={encodeHole(target)}
      aria-haspopup="dialog"
      aria-label={`แก้ค่า ${target.text}`}
      onClick={() => onTap(target)}
    >
      {target.text}
    </button>
  );
}
