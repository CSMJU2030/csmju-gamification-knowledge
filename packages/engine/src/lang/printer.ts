/**
 * Printer — AST → ข้อความ Python ที่จัดรูปแบบมาตรฐาน (เยื้อง 4 ช่อง)
 *
 * การันตี round-trip: สำหรับโปรแกรม p ที่ได้จากการ parse ข้อความมาตรฐาน
 *   parse(toPython(p)).program  deep-equal  p
 * และ toPython เป็น idempotent: toPython(parse(toPython(p))) === toPython(p)
 *
 * ตัวเอดิเตอร์บล็อกในรอบถัดไปใช้ไฟล์นี้แปลง "บล็อกที่ลาก" กลับเป็นโค้ดให้ผู้เล่นอ่าน
 *
 * ข้อจำกัดที่ PM รับทราบและยอมรับแล้ว (9 ก.ย. 2026):
 *   คอมเมนต์ที่เขียน "ข้างในฟังก์ชัน turn()" จะหายไปเมื่อจัดรูปแบบใหม่
 *   เพราะ Stmt ไม่มีช่องเก็บคอมเมนต์ (จงใจ — การเพิ่มช่องคือการแก้สเปกที่แพงเกินรอบนี้)
 *   เก็บได้เฉพาะคอมเมนต์บนสุดของไฟล์ผ่าน Program.header
 *   → UI ในรอบ 2B-2 ต้องเตือนผู้เล่นครั้งแรกที่สลับจากมุมมองข้อความไปมุมมองบล็อก
 */
import type { Expr, Program, Stmt } from './spec';
import { isElifChain } from './parser';

const INDENT = '    ';

/** ระดับความยึดเหนี่ยว ยิ่งมากยิ่งผูกแน่น — ใช้ตัดสินว่าต้องใส่วงเล็บไหม */
const PREC = {
  or: 1,
  and: 2,
  not: 3,
  compare: 4,
  sum: 5,
  term: 6,
  neg: 7,
  atom: 8,
} as const;

function precOf(e: Expr): number {
  switch (e.kind) {
    case 'boolop': return e.op === 'or' ? PREC.or : PREC.and;
    case 'unary': return e.op === 'not' ? PREC.not : PREC.neg;
    case 'compare': return PREC.compare;
    case 'binop': return e.op === '+' || e.op === '-' ? PREC.sum : PREC.term;
    default: return PREC.atom;
  }
}

export function numberLiteral(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  if (Number.isInteger(v)) return String(v);
  return String(v);
}

export function stringLiteral(v: string): string {
  const body = v
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `"${body}"`;
}

function wrap(text: string, childPrec: number, need: number): string {
  return childPrec >= need ? text : `(${text})`;
}

export function exprToPython(e: Expr): string {
  switch (e.kind) {
    case 'num': return numberLiteral(e.value);
    case 'str': return stringLiteral(e.value);
    case 'name': return e.id;
    case 'attr': return `${wrap(exprToPython(e.obj), precOf(e.obj), PREC.atom)}.${e.attr}`;
    case 'call': return `${e.func}(${e.args.map(exprToPython).join(', ')})`;
    case 'compare':
      return `${wrap(exprToPython(e.left), precOf(e.left), PREC.sum)} ${e.op} `
        + `${wrap(exprToPython(e.right), precOf(e.right), PREC.sum)}`;
    case 'boolop': {
      const need = e.op === 'or' ? PREC.and : PREC.not;
      return e.values.map((v) => wrap(exprToPython(v), precOf(v), need)).join(` ${e.op} `);
    }
    case 'unary':
      return e.op === 'not'
        ? `not ${wrap(exprToPython(e.operand), precOf(e.operand), PREC.not)}`
        : `-${wrap(exprToPython(e.operand), precOf(e.operand), PREC.neg)}`;
    case 'binop': {
      const self = precOf(e);
      return `${wrap(exprToPython(e.left), precOf(e.left), self)} ${e.op} `
        + `${wrap(exprToPython(e.right), precOf(e.right), self + 1)}`;
    }
  }
}

/**
 * พิมพ์ตัวคำสั่งข้างในบล็อก — ถ้าไม่มีอะไรเลยต้องใส่ `pass` แทน
 *
 * เพิ่มเมื่อ 19 ก.ย. 2026: เดิม toPython() ใส่ `pass` ให้เฉพาะตอน turn() ทั้งก้อนว่าง
 * แต่ `if`/`for` ที่ body ว่างจะถูกพิมพ์เป็นโค้ดที่ parse ตัวเองไม่ผ่าน (IndentationError)
 * editor-dev เจอตอนผู้เล่นลบบล็อกสุดท้ายข้างใน if แล้วกันไว้ฝั่งเอดิเตอร์
 * แต่มันเป็นกับดักของทุกคนที่สร้าง AST เอง (fromRules, โปรแกรมมอนในรอบ 2C)
 * จึงย้ายมากันที่ต้นทาง — printer ต้องคายโค้ดที่ parse กลับได้เสมอ ไม่มีข้อยกเว้น
 */
function bodyToLines(body: Stmt[], depth: number, out: string[]): void {
  if (body.length === 0) {
    out.push(`${INDENT.repeat(depth)}pass`);
    return;
  }
  for (const b of body) stmtToLines(b, depth, out);
}

function stmtToLines(s: Stmt, depth: number, out: string[]): void {
  const pad = INDENT.repeat(depth);
  switch (s.kind) {
    case 'pass':
      out.push(`${pad}pass`);
      return;
    case 'expr':
      out.push(`${pad}${exprToPython(s.value)}`);
      return;
    case 'assign':
      out.push(`${pad}${s.target} = ${exprToPython(s.value)}`);
      return;
    case 'for':
      out.push(`${pad}for ${s.target} in ${exprToPython(s.iter)}:`);
      bodyToLines(s.body, depth + 1, out);
      return;
    case 'if': {
      let node = s;
      let keyword = 'if';
      for (;;) {
        out.push(`${pad}${keyword} ${exprToPython(node.test)}:`);
        bodyToLines(node.body, depth + 1, out);
        if (isElifChain(node)) {
          node = node.orelse[0] as Extract<Stmt, { kind: 'if' }>;
          keyword = 'elif';
          continue;
        }
        if (node.orelse.length > 0) {
          out.push(`${pad}else:`);
          bodyToLines(node.orelse, depth + 1, out);
        }
        return;
      }
    }
  }
}

/** แปลง Program เป็นข้อความ Python มาตรฐาน (ลงท้ายด้วย \n เสมอ) */
export function toPython(program: Program): string {
  const out: string[] = [];
  if (program.header) {
    for (const line of program.header.split('\n')) out.push(line);
  }
  out.push('def turn():');
  if (program.turn.length === 0) {
    out.push(`${INDENT}pass`);
  } else {
    for (const s of program.turn) stmtToLines(s, 1, out);
  }
  return `${out.join('\n')}\n`;
}
