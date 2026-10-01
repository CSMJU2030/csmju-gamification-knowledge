/**
 * BloxCode — สัญญาของภาษา (เฟส 2B-1)
 * PM เป็นเจ้าของไฟล์นี้ ห้ามแก้โครงสร้างโดยไม่ผ่าน PM
 *
 * BloxCode คือ "ภาษาย่อยของ Python" ที่เราเขียนล่ามเอง (ไม่ได้รัน Python จริง)
 * เหตุผล: ต้องรันฝั่งเซิร์ฟเวอร์เพื่อกันโกง · ต้อง deterministic เพื่อ replay/ทดสอบ balance
 *         · ต้องหยุดได้เสมอ (มีงบโหนด) · ต้องแปลงกลับเป็นบล็อกได้
 *
 * กติกาเหล็ก: ทุกอย่างที่ผู้เล่นพิมพ์ต้องเป็นไวยากรณ์ Python ที่ถูกต้องจริง
 * ถ้ารันโปรแกรมเดียวกันด้วย CPython (พร้อม shim ของ API) ผลต้องออกมาเหมือนกัน
 * → บังคับด้วย differential test ใน CI (ดู engine/test/differential.test.ts)
 */

// =============================================================================
// 1. AST — บล็อก, ข้อความ Python และ evaluator ใช้โครงสร้างชุดนี้ร่วมกัน
// =============================================================================

/** ทุกโหนดพกตำแหน่งไว้ ใช้ทั้งรายงาน error และไฮไลต์บรรทัดที่กำลังทำงานตอนต่อสู้ */
export interface Pos {
  line: number; // เริ่มที่ 1
  col: number;  // เริ่มที่ 1
}

export type CmpOp = '<' | '<=' | '>' | '>=' | '==' | '!=';
export type BinOp = '+' | '-' | '*' | '/';

export type Expr =
  | ({ kind: 'num'; value: number } & Pos)
  | ({ kind: 'str'; value: string } & Pos)
  | ({ kind: 'name'; id: string } & Pos)
  | ({ kind: 'attr'; obj: Expr; attr: string } & Pos)
  | ({ kind: 'call'; func: string; args: Expr[] } & Pos)
  | ({ kind: 'compare'; op: CmpOp; left: Expr; right: Expr } & Pos)
  | ({ kind: 'boolop'; op: 'and' | 'or'; values: Expr[] } & Pos)
  | ({ kind: 'unary'; op: 'not' | '-'; operand: Expr } & Pos)
  | ({ kind: 'binop'; op: BinOp; left: Expr; right: Expr } & Pos);

export type Stmt =
  /** if / elif / else — elif คือ If ที่ซ้อนอยู่ใน orelse (เหมือน ast ของ Python จริง) */
  | ({ kind: 'if'; test: Expr; body: Stmt[]; orelse: Stmt[] } & Pos)
  /** เรียกฟังก์ชันเป็นคำสั่ง เช่น attack(x) */
  | ({ kind: 'expr'; value: Expr } & Pos)
  /** ตัวแปรท้องถิ่น เช่น t = weakest(enemies)  (ปลดล็อกชั้น 8) */
  | ({ kind: 'assign'; target: string; value: Expr } & Pos)
  /** for x in enemies:  (ปลดล็อกชั้น 10 — วนได้ไม่เกินจำนวนสมาชิกจริง) */
  | ({ kind: 'for'; target: string; iter: Expr; body: Stmt[] } & Pos)
  /** pass — ใช้เป็นตัวคั่นตอนผู้เล่นยังต่อบล็อกไม่เสร็จ */
  | ({ kind: 'pass' } & Pos);

/** โปรแกรมของผู้เล่น = ฟังก์ชัน turn() หนึ่งตัว (เฟสนี้ยังไม่มีฟังก์ชันที่ผู้เล่นสร้างเอง) */
export interface Program {
  /** คอมเมนต์บนสุดของไฟล์ (ถ้ามี) — เก็บไว้เพื่อ round-trip ข้อความไม่ให้หาย */
  header?: string;
  turn: Stmt[];
}

// =============================================================================
// 2. Error — ชื่อเป็นอังกฤษเหมือน Python จริง ข้อความอธิบายเป็นไทย
// =============================================================================

export type ErrorName =
  | 'SyntaxError'
  | 'IndentationError'
  | 'NameError'
  | 'TypeError'
  | 'ValueError'
  | 'LockedFeatureError'; // ไวยากรณ์นี้ยังไม่ปลดล็อก (ของเราเอง ไม่มีใน Python)

export interface LangError {
  name: ErrorName;
  /** ข้อความภาษาไทย บอกให้ชัดว่าผิดอะไรและควรแก้ยังไง */
  messageTh: string;
  line: number;
  col: number;
}

// =============================================================================
// 3. API ที่ผู้เล่นเรียกได้
// =============================================================================

/** ตัวแปรระดับบนสุด */
export const GLOBALS = ['me', 'enemies', 'allies', 'turn_no'] as const;

/**
 * attribute ของ me — ห้ามเข้าถึงตัวอื่นนอกรายการนี้ (NameError)
 *
 * หมายเหตุ (แก้ 9 ก.ย. 2026): เดิมสเปกใช้ `def` แต่ `def` เป็นคำสงวนของ Python
 * `me.def` จึงเป็น SyntaxError ใน CPython จริง = ผิดกติกาเหล็กของโปรเจกต์
 * จึงเปลี่ยนเป็น `defense` / `magic_defense` (ได้ตัวเข้าถึง mdef เพิ่มมาด้วย)
 */
export const ME_ATTRS = [
  'hp', 'mp', 'hp_pct', 'mp_pct', 'level', 'atk', 'matk',
  'defense', 'magic_defense', 'speed',
] as const;

/** attribute ของสมาชิกใน enemies/allies */
export const UNIT_ATTRS = ['hp', 'hp_pct', 'level', 'atk', 'speed'] as const;

/**
 * ตัดสินใจแล้ว (PM, 9 ก.ย. 2026): `can_cast("x")` เป็นการ "ถาม" ไม่ใช่ "ใช้"
 * จึงไม่ต้องมีสกิลนั้นอยู่ในมือก็เรียกได้ — ถ้าไม่มีก็คืน False เฉย ๆ
 * เปิดทางให้เขียนโค้ดกันพลาดได้ เช่น `if can_cast("heal"): cast("heal", me)`
 *
 * (19 ก.ย. 2026 รอบ 2P: ย่อหน้านี้เดิมอธิบายว่าทำไม can_cast ไม่กิน MB —
 *  ตัดออกพร้อมกับระบบ Memory ตาม docs/design-round2p.md §3.1 เหตุผลที่เหลือยังเดิม)
 */

/** ฟังก์ชันที่ "ไม่ใช่การกระทำ" — เรียกกี่ครั้งก็ได้ */
export const PURE_FUNCS = {
  weakest: 1,     // (list) -> unit   ตัว HP น้อยสุด
  strongest: 1,   // (list) -> unit   ตัว HP มากสุด
  /** ตัวที่ ATK สูงสุด — "อันตรายที่สุด" ไม่ใช่ "เลือดเยอะสุด" (ใช้ migrate highest_atk_enemy) */
  deadliest: 1,   // (list) -> unit
  fastest: 1,     // (list) -> unit
  random_of: 1,   // (list) -> unit   ใช้ rng ของการต่อสู้ จึงยัง deterministic
  count: 1,       // (list) -> number
  len: 1,         // (list) -> number  ปลดล็อกชั้น 13 (alias ของ count ให้เหมือน Python)
  has_buff: 1,    // (str)  -> bool
  has_debuff: 1,  // (str)  -> bool
  can_cast: 1,    // (str)  -> bool    มีบล็อกนั้น + MP พอ
} as const;

/** ฟังก์ชัน "การกระทำ" — จบเทิร์น เรียกซ้ำจะนับเฉพาะครั้งแรก */
export const ACTION_FUNCS = {
  attack: 1,  // (target)
  cast: 2,    // (skillName, target)
  defend: 0,
  wait: 0,
} as const;

/**
 * ถ้าโปรแกรมวิ่งจบโดยไม่เรียก action ใดเลย ตัวละครจะทำสิ่งนี้แทน
 * (กันผู้เล่นยืนเฉยเพราะเขียนเงื่อนไขไม่ครอบคลุม)
 */
export const FALLBACK_ACTION = 'attack(weakest(enemies))';

// =============================================================================
// 4. ไวยากรณ์ที่ปลดล็อกตามชั้น — "หลักสูตรที่ซ่อนอยู่ในเกม"
// =============================================================================

export type Feature =
  | 'call'        // เรียกฟังก์ชัน + def turn(): + การเยื้อง
  | 'if_else'     // if / else + เปรียบเทียบ
  | 'string'      // ค่าคงที่ข้อความ → cast("firebolt", ...)
  | 'elif'
  | 'boolop'      // and / or / not
  | 'variable'    // t = ...
  | 'for'         // for x in enemies:
  | 'arith'       // + - * / และ len()
  | 'userfunc';   // def ของผู้เล่นเอง (เฟสหลัง — ยังไม่เปิดใน 2B-1)

/** ปลดล็อกเมื่อ "ผ่านชั้นที่ N แล้ว" (highestFloorCleared >= N) */
/**
 * บันไดการปลดล็อก — ไล่ใหม่ในรอบ 2F §3.3 (22 ก.ย. 2026)
 *
 * **ค่าเดิมมีสองตัวที่ไปไม่ถึง:** `arith: 13` ขณะที่ชั้นสูงสุดของเกมคือ 10 และ `for: 10`
 * ตกที่ชั้นสุดท้ายพอดี ผลที่วัดได้ในรอบ 2T: ผู้เล่นเห็น "ต้องผ่านชั้น 13 ก่อน" ซึ่งเป็นคำสัญญา
 * ที่เกมทำให้ไม่ได้ และ `diligent` ต้องฮาร์ดโค้ด `d.hp > 300` แทน `me.atk * 1.5`
 * เพราะเขียนเลขคณิตไม่ได้ทั้งเกม — ครึ่งหนึ่งของภาษาไม่เคยเปิดให้ใครใช้จริง
 *
 * **ลำดับใหม่ตามจังหวะที่ผู้เล่นต้องใช้:**
 *   1 if/else   ทันทีหลังชั้นแรก — การตัดสินใจครั้งแรกคือ "เลือดน้อยแล้วทำไง"
 *   1 string    `cast("firebolt")` ต้องใช้ — ย้ายจาก 2 มา 1 ในรอบ B (26 ก.ย. 2026) ให้ตรงกับจังหวะเลือกอาชีพ
 *               ผู้เล่นรายงานว่าเลือกอาชีพ (หลังชั้น 1) แล้วยังใช้สกิลไม่ได้อีกหนึ่งชั้น จึงเลือกมั่ว
 *               เพราะไม่เคยเห็นอาชีพไหนทำอะไร · `has_debuff("marked")` ก็ใช้ได้ตั้งแต่ตอนนี้ด้วย
 *   3 elif      ต่อจาก if/else ตามธรรมชาติ ห่างกันชั้นเดียวให้ได้ลอง if ก่อน
 *   4 and/or    เงื่อนไขซ้อนเริ่มจำเป็นเมื่อศัตรูมาหลายแบบในเวฟเดียว
 *   5 เลขคณิต   กลางเกม — ตรงกับที่ `diligent` เริ่มต้องการ `me.atk * 1.5` จริง (ราวชั้น 7-8)
 *               จึงต้องมาก่อนหน้านั้น ไม่ใช่หลังจบเกม
 *   6 ตัวแปร    ต่อจากเลขคณิต เพราะตัวแปรที่เก็บค่าที่คำนวณไม่ได้มีประโยชน์น้อยมาก
 *   8 for       เว้นชั้น 9-10 ไว้ให้ **ได้ใช้จริง** — เดิมมันเปิดตอนเกมจบพอดี
 *
 * เว้นสองชั้นสุดท้ายไม่มีอะไรใหม่โดยตั้งใจ: "ตอนนี้คุณมีภาษาครบแล้ว ลองใช้มันดู"
 * เทสต์ `unlock.test.ts` ยืนยันว่าทุกค่าไปถึงได้จริง เพื่อไม่ให้ `13` กลับมาอีก
 */
export const FEATURE_UNLOCK: Record<Feature, number> = {
  call: 0,
  if_else: 1,
  string: 1,
  elif: 3,
  boolop: 4,
  arith: 5,
  variable: 6,
  for: 8,
  userfunc: 999, // ปิดโดยตั้งใจ — ไม่ใช่ค่าที่ไปไม่ถึงโดยบังเอิญ (ดู unlock.test.ts)
};

export function unlockedFeatures(highestFloorCleared: number): Set<Feature> {
  const out = new Set<Feature>();
  for (const [f, floor] of Object.entries(FEATURE_UNLOCK)) {
    if (highestFloorCleared >= floor) out.add(f as Feature);
  }
  return out;
}

/** ข้อความไทยของแต่ละฟีเจอร์ ใช้ตอนแจ้งว่ายังไม่ปลดล็อก */
export const FEATURE_LABEL_TH: Record<Feature, string> = {
  call: 'การเรียกฟังก์ชัน',
  if_else: 'คำสั่ง if / else',
  string: 'ข้อความในเครื่องหมายคำพูด',
  elif: 'คำสั่ง elif',
  boolop: 'ตัวเชื่อม and / or / not',
  variable: 'การสร้างตัวแปร',
  for: 'การวนซ้ำด้วย for',
  arith: 'การคำนวณ + - * / และ len()',
  userfunc: 'การสร้างฟังก์ชันเอง',
};

// =============================================================================
// 5. งบการรันต่อเทิร์น — การันตีว่าโปรแกรมหยุดเสมอ
// =============================================================================

/*
 * เคยมีหัวข้อ "Memory (MB)" อยู่ตรงนี้ — ถอดออกทั้งระบบเมื่อ 19 ก.ย. 2026
 * (docs/design-round2p.md §3.1): MB บีบให้ "เลือกของใส่กระเป๋า" ซึ่งเป็นการตัดสินใจ
 * แบบ RPG ไม่ใช่แบบโปรแกรมเมอร์ ตัวบีบที่เหลือคือ MP · คูลดาวน์ · สกิลปลดตามเลเวล
 * · NODE_BUDGET_PER_TURN · MAX_PROGRAM_LINES ซึ่งบีบ "ตอนรบ" จึงบังคับให้เขียนเงื่อนไขจริง
 */

/** จำนวนโหนด AST สูงสุดที่ประเมินได้ใน 1 เทิร์น เกินแล้วตัดจบและใช้ FALLBACK_ACTION */
export const NODE_BUDGET_PER_TURN = 300;

/** ความยาวโปรแกรมสูงสุด (บรรทัด) — กัน payload ใหญ่เกินและ UI ล้น */
export const MAX_PROGRAM_LINES = 60;

/**
 * นิพจน์ซ้อนกันได้ลึกสุดกี่ชั้น (วงเล็บ · argument · not · เครื่องหมายลบนำหน้า)
 *
 * parser เป็น recursive descent — โปรแกรมที่ซ้อนวงเล็บเป็นพันชั้น (ยังสั้นกว่า 20,000 ตัวอักษร)
 * ทำให้ stack ของ JavaScript ล้นแล้วเซิร์ฟเวอร์ตอบ 500 (พบจากการทดสอบแบบพยายามล้ม ก.ย. 2026)
 * จึงหยุดเป็น SyntaxError ที่บอกเหตุผลได้แทน · CPython เองหยุดที่ 200 ชั้นของวงเล็บ
 * ค่านี้ต่ำกว่านั้น จึงไม่มีทางที่ล่ามเรารับโปรแกรมที่ CPython ไม่รับ (กติกาเหล็กของภาษา)
 */
export const MAX_EXPR_DEPTH = 100;

/**
 * ความลึกของต้นไม้ไวยากรณ์ทั้งต้น (นับจาก def turn ลงไปถึงใบ)
 *
 * MAX_EXPR_DEPTH กันเฉพาะการซ้อนที่ parser ลงไปแบบ recursive แต่ `1+1+1+…` หรือ `me.hp.hp.hp…`
 * parser สร้างด้วยลูป ได้ต้นไม้ที่เอียงลึกหลายพันชั้นโดยไม่ผ่านตัวนับเลย แล้ว validator กับ evaluator
 * (ซึ่งเดินต้นไม้แบบ recursive) ทำ stack ล้นแทน — การทดสอบแบบพยายามล้มรอบที่สองเจอข้อนี้
 * จึงวัดความลึกของต้นไม้ที่ได้จริงหลัง parse อีกชั้น แบบไม่ใช้ recursion
 */
export const MAX_AST_DEPTH = 200;

// =============================================================================
// 6. สัญญาของโมดูลภาษา — engine-dev ต้อง export ตามนี้เป๊ะ
// =============================================================================

export interface ParseResult {
  program: Program | null;
  errors: LangError[];
}

export interface ValidateOptions {
  /** ไวยากรณ์ที่ผู้เล่นคนนี้ปลดล็อกแล้ว */
  features: Set<Feature>;
  /** สกิลที่ผู้เล่นมีสิทธิ์ใช้ (ปลดล็อกตามเลเวล + บล็อกที่ดรอปได้ในเฟส 2C) */
  availableSkills: string[];
}

export interface ValidateResult {
  errors: LangError[];
}

/** ผลการรัน 1 เทิร์น — battle.ts เอาไปแปลงเป็น action จริง */
export interface TurnDecision {
  action: 'attack' | 'skill' | 'defend' | 'wait';
  skillId?: string;
  /** id ของเป้าหมาย ('__self__' = ตัวเอง) */
  targetId?: string;
  /** บรรทัดที่ตัดสินใจ — client ใช้ไฮไลต์ตอนเล่นฉากต่อสู้ */
  line: number;
  /** true เมื่อใช้ FALLBACK_ACTION (โปรแกรมไม่ได้สั่งอะไร หรือใช้งบโหนดหมด) */
  usedFallback: boolean;
  /** คำเตือนที่เกิดตอนรัน เช่น MP ไม่พอ — โชว์ในบันทึกการต่อสู้ */
  warnings?: string[];
}
