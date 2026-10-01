/**
 * ตัวช่วยแก้ AST ตาม StmtPath ของ schema.ts §2
 *
 * ทำไมต้องมีไฟล์นี้: กฎข้อ 1 บังคับว่า state มีชุดเดียวคือ source ดังนั้นทุกการลาก/วาง/ลบ
 * ต้องเป็น "แก้ AST แล้ว toPython() กลับเป็นข้อความ" ไม่ใช่แก้ข้อความตรง ๆ
 * ทุกฟังก์ชันในนี้จึงคืนโครงใหม่เสมอ (immutable) — ของเดิมห้ามถูกแก้ เพราะ React
 * ยังถือ AST รอบก่อนอยู่ระหว่างเรนเดอร์ และการแก้ในที่จะทำให้ภาพกับข้อมูลไม่ตรงกัน
 */
import { isElifChain, type Program, type Stmt } from '@tower/engine/lang';
import type { DropSlot, PathStep, StmtPath } from './schema';

export type IfStmt = Extract<Stmt, { kind: 'if' }>;

/** ตำแหน่งปลอมสำหรับโหนดที่เราสร้างเอง — parse รอบถัดไปจะเติมของจริงให้ (schema.ts §3) */
export const ZERO_POS = { line: 0, col: 0 } as const;

export const passStmt = (): Stmt => ({ kind: 'pass', ...ZERO_POS });

/** รายการคำสั่งของกิ่งนั้น — คืน null เมื่อคำสั่งนี้ไม่มีกิ่งดังกล่าว (เช่น for ไม่มี orelse) */
function branchOf(s: Stmt, br: PathStep['br']): Stmt[] | null {
  if (s.kind === 'if') return br === 'body' ? s.body : s.orelse;
  if (s.kind === 'for') return br === 'body' ? s.body : null;
  return null;
}

function withBranch(s: Stmt, br: PathStep['br'], list: Stmt[]): Stmt {
  if (s.kind === 'if') return br === 'body' ? { ...s, body: list } : { ...s, orelse: list };
  if (s.kind === 'for' && br === 'body') return { ...s, body: list };
  return s;
}

/** รายการคำสั่งที่ path ชี้ไป — null เมื่อ path ใช้ไม่ได้กับ AST ชุดนี้แล้ว */
export function listAt(program: Program, path: StmtPath): Stmt[] | null {
  let list: Stmt[] = program.turn;
  for (const step of path) {
    const node = list[step.i];
    if (!node) return null;
    const next = branchOf(node, step.br);
    if (!next) return null;
    list = next;
  }
  return list;
}

export function stmtAt(program: Program, path: StmtPath, index: number): Stmt | null {
  return listAt(program, path)?.[index] ?? null;
}

function mapList(list: Stmt[], path: StmtPath, depth: number, fn: (l: Stmt[]) => Stmt[]): Stmt[] {
  if (depth === path.length) return fn(list);
  const step = path[depth];
  const node = list[step.i];
  if (!node) return list;
  const child = branchOf(node, step.br);
  if (!child) return list;
  const nextChild = mapList(child, path, depth + 1, fn);
  if (nextChild === child) return list;
  return list.map((s, i) => (i === step.i ? withBranch(s, step.br, nextChild) : s));
}

/** แก้รายการคำสั่งที่ path ชี้ไป แล้วคืน Program ใหม่ */
export function updateList(
  program: Program,
  path: StmtPath,
  fn: (list: Stmt[]) => Stmt[],
): Program {
  const turn = mapList(program.turn, path, 0, fn);
  return turn === program.turn ? program : { ...program, turn };
}

/** true เมื่อรายการนี้มีแค่ pass ตัวเดียว = "ที่ว่างที่ยังไม่ได้ใส่อะไร" */
const isPlaceholder = (l: Stmt[]): boolean => l.length === 1 && l[0].kind === 'pass';

export function insertAt(program: Program, slot: DropSlot, stmt: Stmt): Program {
  return updateList(program, slot.parent, (l) => {
    // หย่อนของจริงลงในที่ว่างที่มีแต่ pass → แทนที่ pass ไปเลย ไม่ต้องให้ผู้เล่นมาลบเอง
    if (isPlaceholder(l)) return [stmt];
    const i = Math.max(0, Math.min(slot.index, l.length));
    return [...l.slice(0, i), stmt, ...l.slice(i)];
  });
}

/**
 * ถอดคำสั่งออก และ "กันตัวบล็อกว่าง"
 *
 * printer ไม่เติม pass ให้ body ที่ว่าง (มีให้เฉพาะตัว turn() ทั้งก้อน) ดังนั้น
 *   if x < 1:
 *   elif ...
 * จะกลายเป็น IndentationError ทันทีที่ลบคำสั่งสุดท้ายข้างใน if ออก
 * — ผิดกฎของ schema.ts ที่ว่าการแก้บล็อกต้องได้โปรแกรมที่ถูกไวยากรณ์เสมอ
 * จึงเติม pass ให้แทนเมื่อ "กิ่ง body" ว่างลง
 *
 * กิ่ง orelse ปล่อยให้ว่างได้ เพราะ orelse ว่าง = ไม่มี else ซึ่งถูกต้องอยู่แล้ว
 * (และจำเป็นด้วย ไม่งั้นการลบ elif จะกลายเป็น else: pass แทนที่จะหายไป)
 */
export function removeAt(program: Program, path: StmtPath, index: number): Program {
  const keepFilled = path.length > 0 && path[path.length - 1].br === 'body';
  return updateList(program, path, (l) => {
    const next = l.filter((_, i) => i !== index);
    return next.length === 0 && keepFilled ? [passStmt()] : next;
  });
}

export function replaceAt(program: Program, path: StmtPath, index: number, stmt: Stmt): Program {
  return updateList(program, path, (l) => l.map((s, i) => (i === index ? stmt : s)));
}

const isPrefix = (a: StmtPath, b: StmtPath): boolean =>
  a.length <= b.length && a.every((s, k) => s.i === b[k].i && s.br === b[k].br);

/**
 * เลื่อนเลข index ของช่องเป้าหมายให้ถูกต้อง "หลัง" คำสั่งต้นทางถูกถอดออก
 *
 * ทำไมต้องมี: path ใช้ index (schema.ts §2) การถอดของออกจึงทำให้ของที่อยู่ถัดไปเลื่อนขึ้น 1
 * ถ้าไม่ปรับ การลากลงล่างจะวางผิดตำแหน่งทีละ 1 ช่องเสมอ
 * คืน null เมื่อเป้าหมายอยู่ "ข้างในตัวมันเอง" — ย้ายแบบนั้นไม่ได้ (บล็อกจะหายไปทั้งก้อน)
 */
export function adjustSlot(to: DropSlot, from: { path: StmtPath; index: number }): DropSlot | null {
  if (!isPrefix(from.path, to.parent)) return to;
  const k = from.path.length;
  if (to.parent.length > k) {
    const step = to.parent[k];
    if (step.i === from.index) return null; // หย่อนลงในตัวเอง
    if (step.i < from.index) return to;
    const parent = to.parent.map((s, i) => (i === k ? { ...s, i: s.i - 1 } : s));
    return { parent, index: to.index };
  }
  return { parent: to.parent, index: to.index > from.index ? to.index - 1 : to.index };
}

/** ย้ายคำสั่งหนึ่งตัวไปยังช่องใหม่ (ถอดก่อนแล้วค่อยแทรก เพื่อไม่ให้มีของซ้ำกลางทาง) */
export function moveStmt(
  program: Program,
  from: { path: StmtPath; index: number },
  to: DropSlot,
): Program {
  const node = stmtAt(program, from.path, from.index);
  if (!node) return program;
  const target = adjustSlot(to, from);
  if (!target) return program;
  return insertAt(removeAt(program, from.path, from.index), target, node);
}

/**
 * เติม else ให้ if (schema.ts §3 — else ไม่ใช่คำสั่งเดี่ยวใน AST)
 *
 * ถ้า if ตัวนี้มี elif ต่อท้ายอยู่ ต้องไล่ลงไปเติมที่ปลายสุดของสาย ไม่ใช่ตัวแรก
 * เพราะการเซ็ต orelse ของตัวแรกทับ = ลบ elif ทั้งสายทิ้ง (ผู้เล่นเสียงานโดยไม่รู้ตัว)
 * คืน null เมื่อปลายสายมี else อยู่แล้ว — ผู้เรียกต้องบอกผู้เล่นว่าเติมซ้ำไม่ได้
 */
function ifWithElse(s: IfStmt): IfStmt | null {
  if (isElifChain(s)) {
    const inner = ifWithElse(s.orelse[0] as IfStmt);
    return inner ? { ...s, orelse: [inner] } : null;
  }
  if (s.orelse.length > 0) return null;
  return { ...s, orelse: [passStmt()] };
}

export function attachElse(
  program: Program,
  path: StmtPath,
  index: number,
): { program: Program; ok: boolean } {
  const node = stmtAt(program, path, index);
  if (!node || node.kind !== 'if') return { program, ok: false };
  const next = ifWithElse(node);
  if (!next) return { program, ok: false };
  return { program: replaceAt(program, path, index, next), ok: true };
}

/** ถอด else ออกจาก if ตัวที่ระบุ (ใช้กับปุ่มลบบนหัว else) */
export function detachElse(program: Program, path: StmtPath, index: number): Program {
  const node = stmtAt(program, path, index);
  if (!node || node.kind !== 'if') return program;
  return replaceAt(program, path, index, { ...node, orelse: [] });
}

/** true เมื่อ if ตัวนี้ (หรือปลายสาย elif ของมัน) ยังเติม else ได้ */
export function canAttachElse(s: Stmt): boolean {
  if (s.kind !== 'if') return false;
  return ifWithElse(s) !== null;
}

// -----------------------------------------------------------------------------
// การเข้ารหัส path ลง DOM — ใช้หา "ช่องที่นิ้วอยู่เหนือ" ตอนลาก
// -----------------------------------------------------------------------------

export const encodePath = (path: StmtPath): string =>
  path.map((s) => `${s.i}${s.br === 'body' ? 'b' : 'e'}`).join('.');

export function decodePath(text: string): StmtPath {
  if (text === '') return [];
  return text.split('.').map((chunk) => ({
    i: Number(chunk.slice(0, -1)),
    br: chunk.endsWith('b') ? ('body' as const) : ('orelse' as const),
  }));
}

export const encodeSlot = (slot: DropSlot): string => `${encodePath(slot.parent)}#${slot.index}`;

export function decodeSlot(text: string): DropSlot {
  const cut = text.lastIndexOf('#');
  return { parent: decodePath(text.slice(0, cut)), index: Number(text.slice(cut + 1)) };
}
