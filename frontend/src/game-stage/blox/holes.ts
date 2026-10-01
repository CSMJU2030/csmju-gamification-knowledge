/**
 * ช่องค่าในบล็อก (hole) ตาม schema.ts §4 — "ลากได้เฉพาะคำสั่ง ส่วนค่าใช้การแตะเลือก"
 *
 * ไฟล์นี้ตอบสองคำถาม:
 *   1. ช่องนี้เลือกอะไรได้บ้าง  → holeSections()
 *   2. เลือกแล้วคำสั่งกลายเป็นอะไร → applyHole()
 *
 * ทุกตัวเลือกต้องเป็นนิพจน์ที่ "ถูกไวยากรณ์อยู่แล้ว" เหมือน BlockDef.make()
 * ไม่งั้นจะมีวินาทีที่โปรแกรมบนจอ parse ไม่ผ่านเพราะเราเองเป็นคนใส่ของพังลงไป
 */
import { exprToPython, type CmpOp, type Expr, type Program, type Stmt } from '@tower/engine/lang';
import {
  CMP_LABEL_TH,
  ME_ATTR_LABEL_TH,
  TARGET_PICKERS,
  type HoleKind,
  type StmtPath,
} from './schema';
import { ZERO_POS, decodePath, encodePath, listAt, stmtAt } from './ast';

// ----------------------------------------------------------------- ตัวช่วยสร้าง Expr
export const nameExpr = (id: string): Expr => ({ kind: 'name', id, ...ZERO_POS });
export const callExpr = (func: string, args: Expr[] = []): Expr =>
  ({ kind: 'call', func, args, ...ZERO_POS });
export const strExpr = (value: string): Expr => ({ kind: 'str', value, ...ZERO_POS });
export const numExpr = (value: number): Expr => ({ kind: 'num', value, ...ZERO_POS });
export const attrExpr = (obj: Expr, attr: string): Expr =>
  ({ kind: 'attr', obj, attr, ...ZERO_POS });

/** ตำแหน่งของช่องค่า "ภายในคำสั่งหนึ่งตัว" — ไม่ต้องมี path ของนิพจน์ซ้อน (ดูหมายเหตุท้ายไฟล์) */
export type HoleWhere =
  | { at: 'arg'; index: number }
  | { at: 'test-left' }
  | { at: 'test-op' }
  | { at: 'test-right' }
  | { at: 'for-iter' }
  | { at: 'assign-value' };

export interface HoleTarget {
  /** รายการคำสั่งที่บล็อกนี้อยู่ */
  path: StmtPath;
  index: number;
  where: HoleWhere;
  kind: HoleKind;
  /** ข้อความบนช่องตอนนี้ (โค้ดอังกฤษ) */
  text: string;
  /** สำหรับช่องเป้าหมายของ cast — true เมื่อสกิลที่เลือกอยู่เป็นสกิลวงกว้าง */
  allowList?: boolean;
}

export interface HoleOption {
  /** ข้อความโค้ด (อังกฤษ — อยู่ในโซนโค้ด) */
  code: string;
  /** คำอธิบายไทย */
  labelTh: string;
  /** บรรทัดรายละเอียด (เช่น สกิลทำอะไร) — เว้นได้ */
  detailTh?: string;
  pick: Expr | CmpOp;
}

export interface HoleSection {
  titleTh: string;
  options: HoleOption[];
}

export interface SkillOption {
  id: string;
  /** ชื่อที่เขียนใน cast() ได้ */
  codeName: string;
  nameTh: string;
  mpCost: number;
  aoe: boolean;
  /**
   * สกิลนี้ทำอะไร (26 ก.ย. 2026 — playtest: "รู้แค่ชื่อสกิล ไม่รู้ว่าทำอะไรได้")
   * สร้างด้วย describeSkill() ของ engine ตัวเลขจึงตรงกับตัวรบเสมอ
   */
  kindTh: string;
  effectTh: string;
  targetTh: string;
  descTh: string;
}

// ----------------------------------------------------------------- ขอบเขตตัวแปร

const dedupe = (xs: string[]): string[] => [...new Set(xs)];

/**
 * ตัวแปรที่ "มองเห็นได้" ณ ตำแหน่งนี้ — ตัวแปรวนซ้ำของ for ที่ครอบอยู่
 * และตัวแปรที่ประกาศไว้ก่อนหน้าในรายการเดียวกันหรือรายการที่ครอบอยู่
 *
 * ทำไมต้องกรองตามตำแหน่ง: เสนอตัวแปรที่ยังไม่ถูกประกาศ = ผู้เล่นเลือกแล้วได้ NameError ทันที
 */
export function localsInScope(program: Program, path: StmtPath, index: number): string[] {
  const out: string[] = [];
  for (let d = 0; d < path.length; d++) {
    const prefix = path.slice(0, d);
    const list = listAt(program, prefix);
    if (!list) break;
    for (let i = 0; i < path[d].i; i++) {
      const s = list[i];
      if (s && s.kind === 'assign') out.push(s.target);
    }
    const owner = stmtAt(program, prefix, path[d].i);
    if (owner && owner.kind === 'for') out.push(owner.target);
  }
  const here = listAt(program, path);
  if (here) {
    for (let i = 0; i < index; i++) {
      const s = here[i];
      if (s && s.kind === 'assign') out.push(s.target);
    }
  }
  return dedupe(out);
}

// ----------------------------------------------------------------- ตัวเลือกของแต่ละช่อง

const LIST_LABEL_TH: Record<string, string> = { enemies: 'ศัตรู', allies: 'พวกเรา' };

function unitSections(locals: string[], allowList: boolean): HoleSection[] {
  const out: HoleSection[] = [];
  if (allowList) {
    out.push({
      titleTh: 'ทั้งกลุ่ม (เฉพาะสกิลวงกว้าง)',
      options: Object.keys(LIST_LABEL_TH).map((l) => ({
        code: l,
        labelTh: `${LIST_LABEL_TH[l]}ทุกตัว`,
        pick: nameExpr(l),
      })),
    });
  }
  out.push({
    titleTh: 'ตัวเอง',
    options: [{ code: 'me', labelTh: 'ตัวละครของเรา', pick: nameExpr('me') }],
  });
  for (const list of Object.keys(LIST_LABEL_TH)) {
    out.push({
      titleTh: `เลือกจาก${LIST_LABEL_TH[list]} (${list})`,
      options: TARGET_PICKERS.map((p) => ({
        code: `${p.func}(${list})`,
        labelTh: p.labelTh,
        pick: callExpr(p.func, [nameExpr(list)]),
      })),
    });
  }
  if (locals.length > 0) {
    out.push({
      titleTh: 'ตัวแปรที่คุณเก็บไว้',
      options: locals.map((id) => ({
        code: id,
        labelTh: 'ค่าที่เก็บไว้ก่อนหน้านี้',
        pick: nameExpr(id),
      })),
    });
  }
  return out;
}

function listSections(): HoleSection[] {
  return [{
    titleTh: 'ลิสต์ตัวละคร',
    options: Object.keys(LIST_LABEL_TH).map((l) => ({
      code: l,
      labelTh: `${LIST_LABEL_TH[l]}ทุกตัวที่ยังไม่ตาย`,
      pick: nameExpr(l),
    })),
  }];
}

function attrSections(locals: string[]): HoleSection[] {
  const out: HoleSection[] = [{
    titleTh: 'คุณสมบัติของเรา',
    options: Object.entries(ME_ATTR_LABEL_TH).map(([attr, labelTh]) => ({
      code: `me.${attr}`,
      labelTh,
      pick: attrExpr(nameExpr('me'), attr),
    })),
  }, {
    titleTh: 'ค่าอื่นที่เอามาเทียบได้',
    options: [
      { code: 'count(enemies)', labelTh: 'จำนวนศัตรูที่เหลือ', pick: callExpr('count', [nameExpr('enemies')]) },
      { code: 'count(allies)', labelTh: 'จำนวนพวกเราที่เหลือ', pick: callExpr('count', [nameExpr('allies')]) },
      { code: 'turn_no', labelTh: 'เทิร์นที่เท่าไรแล้ว', pick: nameExpr('turn_no') },
      { code: 'weakest(enemies).hp_pct', labelTh: 'เลือด (%) ของศัตรูที่อ่อนสุด', pick: attrExpr(callExpr('weakest', [nameExpr('enemies')]), 'hp_pct') },
    ],
  }];
  if (locals.length > 0) {
    out.push({
      titleTh: 'ตัวแปรที่คุณเก็บไว้',
      options: locals.map((id) => ({
        code: `${id}.hp_pct`,
        labelTh: 'เลือด (%) ของตัวที่เก็บไว้',
        pick: attrExpr(nameExpr(id), 'hp_pct'),
      })),
    });
  }
  return out;
}

function cmpSections(): HoleSection[] {
  return [{
    titleTh: 'ตัวเปรียบเทียบ',
    options: Object.entries(CMP_LABEL_TH).map(([op, labelTh]) => ({
      code: op,
      labelTh,
      pick: op as CmpOp,
    })),
  }];
}

function skillSections(skills: SkillOption[]): HoleSection[] {
  if (skills.length === 0) {
    return [{ titleTh: 'ยังไม่มีสกิลที่ใช้ได้ — อัพเลเวลก่อน', options: [] }];
  }
  return [{
    titleTh: 'สกิลที่ใช้ได้ตอนนี้',
    options: skills.map((s) => ({
      code: `"${s.codeName}"`,
      // ถอด "· N MB" ออกเมื่อ 19 ก.ย. 2026 พร้อมระบบ Memory (รอบ 2P §3.1)
      labelTh: `${s.nameTh} · MP ${s.mpCost}`,
      ...(s.effectTh ? { detailTh: `${s.kindTh} · ${s.effectTh} · ${s.targetTh}` } : {}),
      pick: strExpr(s.codeName),
    })),
  }];
}

/** ตัวเลขที่ใช้บ่อยในเงื่อนไข — ผู้เล่นพิมพ์เองได้ด้วยในเมนู */
export const NUM_PRESETS = [0, 1, 2, 3, 10, 20, 25, 30, 40, 50, 60, 75, 80, 100];

export function holeSections(
  hole: HoleTarget,
  ctx: { locals: string[]; skills: SkillOption[] },
): HoleSection[] {
  switch (hole.kind) {
    case 'unit': return unitSections(ctx.locals, hole.allowList === true);
    case 'list': return listSections();
    case 'attr': return attrSections(ctx.locals);
    case 'cmpop': return cmpSections();
    case 'skill': return skillSections(ctx.skills);
    // ช่องตัวเลขมีแป้นใส่เลขอยู่ในเมนูอยู่แล้ว ส่วนนี้คือทางเลือก "เทียบกับค่าอื่นแทน"
    case 'num': return attrSections(ctx.locals);
  }
}

export const HOLE_TITLE_TH: Record<HoleKind, string> = {
  unit: 'เลือกเป้าหมาย',
  list: 'เลือกลิสต์',
  num: 'ใส่ตัวเลข',
  skill: 'เลือกสกิล',
  attr: 'เลือกค่าที่เอามาเทียบ',
  cmpop: 'เลือกตัวเปรียบเทียบ',
};

// ----------------------------------------------------------------- การใส่ค่ากลับเข้า AST

export function applyHole(stmt: Stmt, where: HoleWhere, pick: Expr | CmpOp): Stmt {
  const isOp = typeof pick === 'string';
  switch (where.at) {
    case 'arg': {
      if (stmt.kind !== 'expr' || stmt.value.kind !== 'call' || isOp) return stmt;
      const args = stmt.value.args.map((a, i) => (i === where.index ? pick : a));
      return { ...stmt, value: { ...stmt.value, args } };
    }
    case 'test-left':
      if (stmt.kind !== 'if' || stmt.test.kind !== 'compare' || isOp) return stmt;
      return { ...stmt, test: { ...stmt.test, left: pick } };
    case 'test-right':
      if (stmt.kind !== 'if' || stmt.test.kind !== 'compare' || isOp) return stmt;
      return { ...stmt, test: { ...stmt.test, right: pick } };
    case 'test-op':
      if (stmt.kind !== 'if' || stmt.test.kind !== 'compare' || !isOp) return stmt;
      return { ...stmt, test: { ...stmt.test, op: pick } };
    case 'for-iter':
      if (stmt.kind !== 'for' || isOp) return stmt;
      return { ...stmt, iter: pick };
    case 'assign-value':
      if (stmt.kind !== 'assign' || isOp) return stmt;
      return { ...stmt, value: pick };
  }
}

/**
 * ซ่อมคำสั่ง cast ให้เข้ากันเองหลังเปลี่ยนสกิล
 *
 * ทำไม: เปลี่ยนจากสกิลวงกว้าง (เล็ง enemies ทั้งลิสต์) ไปเป็นสกิลเล็งเดี่ยว จะได้ TypeError ทันที
 * ทั้งที่ผู้เล่นแค่ "เลือกสกิลอื่น" — ซ่อมให้เลยดีกว่าปล่อยให้เขาเจอ error ที่ไม่ได้ตั้งใจสร้าง
 */
export function normalizeCast(stmt: Stmt, isAoe: (skillName: string) => boolean): Stmt {
  if (stmt.kind !== 'expr' || stmt.value.kind !== 'call' || stmt.value.func !== 'cast') return stmt;
  const [nameNode, target] = stmt.value.args;
  if (!nameNode || nameNode.kind !== 'str' || !target) return stmt;
  const targetIsList = target.kind === 'name' && (target.id === 'enemies' || target.id === 'allies');
  if (!targetIsList || isAoe(nameNode.value)) return stmt;
  const fixed = callExpr('weakest', [target]);
  return { ...stmt, value: { ...stmt.value, args: [nameNode, fixed] } };
}

export const holeText = (e: Expr): string => exprToPython(e);

// ----------------------------------------------------------------- คีย์ของช่องใน DOM

/**
 * ช่องค่าถูกอ้างด้วยสตริงบน data-hole ไม่ใช่ทะเบียนใน ref
 *
 * ทำไม: การแตะช่องถูกตรวจจับที่ระดับบล็อก (pointerdown บนบล็อกอาจกลายเป็นการลาก)
 * ตัวจัดการจึงได้มาแค่ DOM element ที่ถูกแตะ — เข้ารหัสไว้บน element เลยจะได้ไม่ต้อง
 * เก็บทะเบียนที่อาจค้างของเก่าไว้หลังจาก AST เปลี่ยนไปแล้ว
 */
const WHERE_CODE: Record<Exclude<HoleWhere['at'], 'arg'>, string> = {
  'test-left': 'tl',
  'test-op': 'to',
  'test-right': 'tr',
  'for-iter': 'fi',
  'assign-value': 'av',
};

export function encodeHole(h: HoleTarget): string {
  const w = h.where.at === 'arg' ? `a${h.where.index}` : WHERE_CODE[h.where.at];
  return [encodePath(h.path), String(h.index), w, h.kind, h.allowList ? '1' : '0', h.text].join('|');
}

const WHERE_FROM_CODE = new Map<string, Exclude<HoleWhere['at'], 'arg'>>(
  Object.entries(WHERE_CODE).map(([at, code]) => [code, at as Exclude<HoleWhere['at'], 'arg'>]),
);

export function decodeHole(text: string): HoleTarget | null {
  const parts = text.split('|');
  if (parts.length < 6) return null;
  const [pathText, indexText, whereText, kind, allow] = parts;
  let where: HoleWhere | null = null;
  if (whereText.startsWith('a')) where = { at: 'arg', index: Number(whereText.slice(1)) };
  else {
    const at = WHERE_FROM_CODE.get(whereText);
    if (at) where = { at };
  }
  if (!where) return null;
  return {
    path: decodePath(pathText),
    index: Number(indexText),
    where,
    kind: kind as HoleKind,
    allowList: allow === '1',
    text: parts.slice(5).join('|'),
  };
}

/*
 * หมายเหตุออกแบบ: ช่องค่าอ้างด้วย "ตำแหน่งในคำสั่ง" ไม่ใช่ path ของนิพจน์ซ้อน
 * เพราะ §4 ตัดสินใจแล้วว่าไม่ลาก expression — ช่องที่แตะได้จึงมีจำกัดและตื้นเสมอ
 * นิพจน์ที่ซับซ้อนกว่านั้น (เช่น and/or หรือ + - * /) แสดงเป็นข้อความอ่านอย่างเดียว
 * แล้วให้ไปแก้ในมุมมองข้อความ — ดีกว่าทำเมนูที่เลือกได้ไม่ครบแล้วผู้เล่นเข้าใจผิดว่าแก้ได้
 */
