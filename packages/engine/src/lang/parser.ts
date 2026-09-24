/**
 * Parser — recursive descent + precedence climbing
 * รับข้อความ Python (ชุดย่อย) → Program ตาม spec.ts
 *
 * ไวยากรณ์ที่รองรับ (EBNF):
 *   file      := comment* 'def' 'turn' '(' ')' ':' NEWLINE INDENT stmt+ DEDENT EOF
 *   stmt      := if_stmt | for_stmt | simple
 *   if_stmt   := 'if' expr ':' block ('elif' expr ':' block)* ['else' ':' block]
 *   for_stmt  := 'for' NAME 'in' expr ':' block
 *   simple    := 'pass' NEWLINE | NAME '=' expr NEWLINE | expr NEWLINE
 *   block     := NEWLINE INDENT stmt+ DEDENT
 *   expr      := or_
 *   or_       := and_ ('or' and_)*
 *   and_      := not_ ('and' not_)*
 *   not_      := 'not' not_ | cmp
 *   cmp       := sum [('<'|'<='|'>'|'>='|'=='|'!=') sum]     (ห้ามเชนต่อ)
 *   sum       := term (('+'|'-') term)*
 *   term      := factor (('*'|'/') factor)*
 *   factor    := '-' factor | trailer
 *   trailer   := atom ('.' NAME)*
 *   atom      := NUMBER | STRING | NAME | NAME '(' [expr (',' expr)*] ')' | '(' expr ')'
 *
 * `elif` ถูกแปลงเป็น If ที่ซ้อนใน orelse เหมือน ast ของ CPython เป๊ะ ๆ
 * (คอลัมน์ของ If ที่ซ้อนอยู่ = คอลัมน์ของคำว่า elif = คอลัมน์ของ if ตัวแม่)
 */
import { MAX_PROGRAM_LINES } from './spec';
import type { BinOp, CmpOp, Expr, ParseResult, Program, Stmt } from './spec';
import { LangErrorException, fail } from './errors';
import { CONSTANT_KEYWORDS, tokenize, type Token } from './tokenizer';

const CMP_OPS = new Set<string>(['<', '<=', '>', '>=', '==', '!=']);

/**
 * คำสงวนของ Python ใช้เป็นชื่อไม่ได้ — ต้องปฏิเสธให้เหมือน CPython เป๊ะ
 * (กติกาเหล็ก: ห้ามมีอะไรที่ล่ามเรารับแต่ CPython ไม่รับ)
 * `def` เจอบ่อยเป็นพิเศษเพราะสเปกรุ่นแรกเคยใช้ me.def จึงมีคำแนะนำเฉพาะ
 */
const KEYWORD_RENAMES: Record<string, string> = {
  def: 'defense',
};

/** บทบาทของชื่อในไวยากรณ์ — ใช้เลือกคำในข้อความ error ให้ตรงกับสิ่งที่ผู้เล่นกำลังพิมพ์ */
type NameRole = 'attr' | 'var' | 'loopvar' | 'func' | 'value';

const ROLE_TH: Record<NameRole, string> = {
  attr: 'ชื่อคุณสมบัติหลังจุด',
  var: 'ชื่อตัวแปร',
  loopvar: 'ชื่อตัวแปรของ for',
  func: 'ชื่อฟังก์ชัน',
  value: 'ชื่อหรือค่า',
};

class Parser {
  private p = 0;

  constructor(private readonly toks: Token[]) {}

  private peek(k = 0): Token {
    return this.toks[Math.min(this.p + k, this.toks.length - 1)];
  }

  private at(type: string, value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }

  private next(): Token {
    return this.toks[this.p++];
  }

  private describe(t: Token): string {
    switch (t.type) {
      case 'EOF': return 'จุดจบไฟล์';
      case 'NEWLINE': return 'จุดจบบรรทัด';
      case 'INDENT': return 'การเยื้อง';
      case 'DEDENT': return 'การลดการเยื้อง';
      default: return `'${t.value}'`;
    }
  }

  /**
   * ปฏิเสธคำสงวนที่ถูกใช้เป็นชื่อ — ทุกเส้นทางที่ต้องการชื่อวิ่งมาลงที่นี่ที่เดียว
   * เพื่อให้ข้อความออกมาเหมือนกันหมดและเพิ่มคำแนะนำเฉพาะคำได้จากจุดเดียว
   */
  private failKeywordAsName(t: Token, role: NameRole): never {
    const what = ROLE_TH[role];
    const kindTh = CONSTANT_KEYWORDS.has(t.value) ? 'ค่าคงที่ของ Python' : 'คำสงวนของ Python';
    const rename = KEYWORD_RENAMES[t.value];
    // คำแนะนำ "ใช้ชื่อนี้แทน" มีความหมายเฉพาะตอนเป็นคุณสมบัติ (me.def → me.defense)
    // ที่อื่นบอกแค่ว่าเป็นคำสงวน ไม่งั้นจะชี้ทางผิด เช่น attack(def) ไม่ได้อยากได้ defense
    const hint = rename && role === 'attr'
      ? ` — ในเกมนี้ใช้ '.${rename}' แทน (เช่น me.${rename})`
      : '';
    fail('SyntaxError', `'${t.value}' เป็น${kindTh} ใช้เป็น${what}ไม่ได้${hint}`, t.line, t.col);
  }

  /** คำสงวนที่ทำหน้าที่เป็นไวยากรณ์จริง ๆ เช่น 'if' 'in' — ต่างจาก expectName ที่ต้องการชื่อ */
  private atKeyword(value: string): boolean {
    const t = this.peek();
    return t.type === 'KEYWORD' && t.value === value;
  }

  private expectKeyword(value: string, hint?: string): Token {
    if (this.atKeyword(value)) return this.next();
    const t = this.peek();
    fail(
      'SyntaxError',
      hint ?? `ต้องมี '${value}' ตรงนี้ แต่เจอ ${this.describe(t)}`,
      t.line,
      t.col,
    );
  }

  private expectOp(value: string, hint?: string): Token {
    if (this.at('OP', value)) return this.next();
    const t = this.peek();
    // สับสนระหว่าง "กำหนดค่า" กับ "เปรียบเทียบ" เป็นความผิดพลาดอันดับหนึ่งของมือใหม่
    if (t.type === 'OP' && t.value === '=') {
      fail('SyntaxError', "ต้องการเปรียบเทียบใช่ไหม? ใช้ '==' (สองตัว) ไม่ใช่ '='", t.line, t.col);
    }
    fail(
      'SyntaxError',
      hint ?? `ต้องมี '${value}' ตรงนี้ แต่เจอ ${this.describe(t)}`,
      t.line,
      t.col,
    );
  }

  /**
   * ขอ "ชื่อจริง ๆ" — คำสงวนไม่ใช่ NAME แล้วจึงตกมาที่นี่เสมอ และได้ข้อความที่บอกเหตุผล
   * แทนที่จะเป็น hint กลาง ๆ ที่ไม่ช่วยให้ผู้เล่นรู้ว่าทำไมชื่อนี้ใช้ไม่ได้
   */
  private expectName(role: NameRole, hint?: string): Token {
    if (this.at('NAME')) return this.next();
    const t = this.peek();
    if (t.type === 'KEYWORD') this.failKeywordAsName(t, role);
    fail(
      'SyntaxError',
      hint ?? `ต้องเป็นชื่อ แต่เจอ ${this.describe(t)}`,
      t.line,
      t.col,
    );
  }

  private expectNewline(): void {
    if (this.at('NEWLINE')) { this.next(); return; }
    const t = this.peek();
    if (t.type === 'OP' && t.value === '=') {
      fail('SyntaxError', "ต้องการเปรียบเทียบใช่ไหม? ใช้ '==' (สองตัว) ไม่ใช่ '='", t.line, t.col);
    }
    fail('SyntaxError', `เจอ ${this.describe(t)} เกินมาท้ายคำสั่ง — ต้องขึ้นบรรทัดใหม่`, t.line, t.col);
  }

  // ---------------------------------------------------------------- program
  parseProgram(header: string | undefined): Program {
    this.expectKeyword('def', 'โปรแกรมต้องเริ่มด้วย "def turn():"');
    const nameTok = this.peek();
    if (nameTok.type === 'KEYWORD') this.failKeywordAsName(nameTok, 'func');
    if (!this.at('NAME')) {
      fail('SyntaxError', 'หลัง def ต้องตามด้วยชื่อฟังก์ชัน', nameTok.line, nameTok.col);
    }
    if (nameTok.value !== 'turn') {
      fail(
        'LockedFeatureError',
        `เฟสนี้สร้างฟังก์ชันเองยังไม่ได้ — ต้องชื่อ turn เท่านั้น (เจอ '${nameTok.value}')`,
        nameTok.line,
        nameTok.col,
      );
    }
    this.next();
    this.expectOp('(', 'ต้องเป็น "def turn():" — ใส่วงเล็บ ( ) ให้ครบ');
    if (!this.at('OP', ')')) {
      const t = this.peek();
      fail('SyntaxError', 'turn() ต้องไม่มีพารามิเตอร์ — เขียนเป็น def turn():', t.line, t.col);
    }
    this.next();
    this.expectOp(':', 'ลืมเครื่องหมาย : ท้ายบรรทัด def turn()');
    const body = this.parseBlock('def turn()');

    if (this.atKeyword('def')) {
      const t = this.peek();
      fail(
        'LockedFeatureError',
        'เฟสนี้มีได้แค่ฟังก์ชัน turn() ตัวเดียว — การสร้างฟังก์ชันเองยังไม่ปลดล็อก',
        t.line,
        t.col,
      );
    }
    if (!this.at('EOF')) {
      const t = this.peek();
      fail('SyntaxError', `เจอ ${this.describe(t)} นอกฟังก์ชัน turn() — ทุกคำสั่งต้องอยู่ใน turn()`, t.line, t.col);
    }
    return header === undefined ? { turn: body } : { header, turn: body };
  }

  private parseBlock(owner: string): Stmt[] {
    this.expectNewline();
    if (!this.at('INDENT')) {
      const t = this.peek();
      fail(
        'IndentationError',
        `การเยื้องไม่ถูกต้อง: ต้องเยื้องเข้าไป 4 ช่องหลัง ${owner}`,
        t.line,
        t.col,
      );
    }
    this.next();
    const out: Stmt[] = [];
    while (!this.at('DEDENT') && !this.at('EOF')) {
      out.push(this.parseStmt());
    }
    if (this.at('DEDENT')) this.next();
    if (out.length === 0) {
      const t = this.peek();
      fail('IndentationError', `บล็อกของ ${owner} ว่างเปล่า — ใส่คำสั่งอย่างน้อย 1 บรรทัด (ใช้ pass ได้)`, t.line, t.col);
    }
    return out;
  }

  // ------------------------------------------------------------- statements
  private parseStmt(): Stmt {
    const t = this.peek();
    if (t.type === 'INDENT') {
      fail('IndentationError', 'บรรทัดนี้เยื้องเกินมาโดยไม่มีเหตุผล — ลบช่องว่างหน้าบรรทัดออก', t.line, t.col);
    }
    // คำสงวนตามด้วย '=' คือความพยายามกำหนดค่าให้คำสงวน (if = 5, and = 3, True = 1)
    // ต้องดักก่อนแยกชนิดคำสั่ง ไม่งั้น 'if' จะถูกส่งไป parseIf แล้วได้ข้อความที่ไม่ตรงเหตุ
    // ไม่มีโปรแกรม Python ที่ถูกต้องตัวไหนมีคำสงวนตามด้วย '=' จึงไม่มีทาง false positive
    if (t.type === 'KEYWORD' && this.peek(1).type === 'OP' && this.peek(1).value === '=') {
      this.failKeywordAsName(t, 'var');
    }
    if (t.type === 'KEYWORD') {
      if (t.value === 'if') return this.parseIf('if');
      if (t.value === 'for') return this.parseFor();
      if (t.value === 'pass') {
        this.next();
        this.expectNewline();
        return { kind: 'pass', line: t.line, col: t.col };
      }
      if (t.value === 'elif' || t.value === 'else') {
        fail('SyntaxError', `'${t.value}' ต้องอยู่ต่อจากบล็อก if ที่เยื้องเท่ากัน`, t.line, t.col);
      }
    }
    if (t.type === 'NAME') {
      // assign?  NAME '=' expr
      if (this.peek(1).type === 'OP' && this.peek(1).value === '=') {
        const target = this.next().value;
        this.next(); // '='
        const value = this.parseExpr();
        this.expectNewline();
        return { kind: 'assign', target, value, line: t.line, col: t.col };
      }
    }
    const value = this.parseExpr();
    this.expectNewline();
    return { kind: 'expr', value, line: t.line, col: t.col };
  }

  private parseIf(kw: 'if' | 'elif'): Stmt {
    const t = this.expectKeyword(kw);
    const test = this.parseExpr();
    this.expectOp(':', `ลืมเครื่องหมาย : ท้ายเงื่อนไข ${kw}`);
    const body = this.parseBlock(kw);
    let orelse: Stmt[] = [];
    if (this.atKeyword('elif')) {
      orelse = [this.parseIf('elif')];
    } else if (this.atKeyword('else')) {
      this.next();
      this.expectOp(':', 'ลืมเครื่องหมาย : ท้ายบรรทัด else');
      orelse = this.parseBlock('else');
    }
    return { kind: 'if', test, body, orelse, line: t.line, col: t.col };
  }

  private parseFor(): Stmt {
    const t = this.expectKeyword('for');
    const targetTok = this.expectName('loopvar', 'หลัง for ต้องเป็นชื่อตัวแปร เช่น for e in enemies:');
    this.expectKeyword('in', "ต้องเขียนเป็น for <ตัวแปร> in <ลิสต์>: — ลืมคำว่า 'in'");
    const iter = this.parseExpr();
    this.expectOp(':', 'ลืมเครื่องหมาย : ท้ายบรรทัด for');
    const body = this.parseBlock('for');
    return { kind: 'for', target: targetTok.value, iter, body, line: t.line, col: t.col };
  }

  // ------------------------------------------------------------ expressions
  parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    if (!this.atKeyword('or')) return left;
    const values: Expr[] = [left];
    const t0 = left;
    while (this.atKeyword('or')) {
      this.next();
      values.push(this.parseAnd());
    }
    left = { kind: 'boolop', op: 'or', values, line: t0.line, col: t0.col };
    return left;
  }

  private parseAnd(): Expr {
    const first = this.parseNot();
    if (!this.atKeyword('and')) return first;
    const values: Expr[] = [first];
    while (this.atKeyword('and')) {
      this.next();
      values.push(this.parseNot());
    }
    return { kind: 'boolop', op: 'and', values, line: first.line, col: first.col };
  }

  private parseNot(): Expr {
    // `not(x)` ไม่ใช่การเรียกฟังก์ชันชื่อ not แต่เป็น unary not กับวงเล็บ — CPython รับ เราจึงต้องรับ
    if (this.atKeyword('not')) {
      const t = this.next();
      const operand = this.parseNot();
      return { kind: 'unary', op: 'not', operand, line: t.line, col: t.col };
    }
    return this.parseCompare();
  }

  private parseCompare(): Expr {
    const left = this.parseSum();
    const t = this.peek();
    // `x in enemies` เป็น Python ที่ถูกต้อง แต่เรายังไม่มีตัวดำเนินการนี้ — ต้องบอกเหตุผล
    // ไม่ใช่ปล่อยให้ไปโผล่เป็น "ต้องมี ':' ตรงนี้" ซึ่งไม่ช่วยให้ผู้เล่นเข้าใจอะไรเลย
    // (parseFor กิน 'in' ไปก่อนแล้ว จุดนี้จึงไม่มีทางชนกับ for ... in ...)
    if (t.type === 'KEYWORD' && t.value === 'in') {
      fail(
        'SyntaxError',
        "ยังไม่รองรับตัวดำเนินการ 'in' นอกคำสั่ง for — ใช้ count()/has_buff() ตรวจแทน",
        t.line,
        t.col,
      );
    }
    if (t.type === 'OP' && CMP_OPS.has(t.value)) {
      this.next();
      const right = this.parseSum();
      const after = this.peek();
      if (after.type === 'OP' && CMP_OPS.has(after.value)) {
        fail(
          'SyntaxError',
          'ยังไม่รองรับการเปรียบเทียบต่อกัน (a < b < c) — แยกเป็นสองเงื่อนไขแล้วเชื่อมด้วย and',
          after.line,
          after.col,
        );
      }
      return { kind: 'compare', op: t.value as CmpOp, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseSum(): Expr {
    let left = this.parseTerm();
    while (this.at('OP', '+') || this.at('OP', '-')) {
      const op = this.next().value as BinOp;
      const right = this.parseTerm();
      left = { kind: 'binop', op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseFactor();
    while (this.at('OP', '*') || this.at('OP', '/')) {
      const op = this.next().value as BinOp;
      const right = this.parseFactor();
      left = { kind: 'binop', op, left, right, line: left.line, col: left.col };
    }
    return left;
  }

  private parseFactor(): Expr {
    if (this.at('OP', '-')) {
      const t = this.next();
      const operand = this.parseFactor();
      return { kind: 'unary', op: '-', operand, line: t.line, col: t.col };
    }
    if (this.at('OP', '+')) {
      const t = this.peek();
      fail('SyntaxError', "ไม่รองรับเครื่องหมาย + นำหน้าตัวเลข — ตัดออกได้เลย", t.line, t.col);
    }
    return this.parseTrailer();
  }

  private parseTrailer(): Expr {
    let node = this.parseAtom();
    while (this.at('OP', '.')) {
      this.next();
      const nameTok = this.expectName('attr', 'หลังจุด . ต้องเป็นชื่อคุณสมบัติ เช่น me.hp');
      if (this.at('OP', '(')) {
        fail(
          'SyntaxError',
          `ยังไม่รองรับการเรียกเมธอด '.${nameTok.value}()' — ใช้ฟังก์ชันของเกม เช่น weakest(enemies)`,
          nameTok.line,
          nameTok.col,
        );
      }
      node = { kind: 'attr', obj: node, attr: nameTok.value, line: node.line, col: node.col };
    }
    return node;
  }

  private parseAtom(): Expr {
    const t = this.peek();
    if (t.type === 'NUMBER') {
      this.next();
      return { kind: 'num', value: Number(t.value), line: t.line, col: t.col };
    }
    if (t.type === 'STRING') {
      this.next();
      return { kind: 'str', value: t.value, line: t.line, col: t.col };
    }
    if (t.type === 'OP' && t.value === '(') {
      this.next();
      // `()` และ `(a, b)` เป็น tuple ของ Python — ถูกไวยากรณ์แต่ภาษาเราไม่มี tuple เลย
      // (เจอบ่อยสุดผ่าน `not(a, b)` ซึ่ง Python มองเป็น not ของ tuple แล้วได้ False เสมอ)
      if (this.at('OP', ')')) {
        const e = this.peek();
        fail('SyntaxError', 'วงเล็บว่าง () ไม่มีความหมายในภาษานี้ — ใส่ค่าไว้ข้างในด้วย', e.line, e.col);
      }
      const inner = this.parseExpr();
      if (this.at('OP', ',')) {
        const e = this.peek();
        fail(
          'SyntaxError',
          'ยังไม่รองรับ tuple แบบ (a, b) — วงเล็บใช้ได้แค่จัดลำดับการคำนวณหรือใส่ argument ของฟังก์ชัน',
          e.line,
          e.col,
        );
      }
      this.expectOp(')', 'ลืมปิดวงเล็บ )');
      return inner;
    }
    if (t.type === 'KEYWORD') {
      /**
       * True / False / None เป็น literal ของ Python จริง แต่ AST ใน spec.ts (PM เป็นเจ้าของ)
       * ไม่มีชนิดสำหรับค่าบูลีน/None จะรองรับจริงต้องแก้ spec — จึงปฏิเสธด้วย SyntaxError
       * ที่บอกเหตุผลชัด ๆ ทุกตำแหน่ง (ห้ามปล่อยให้กลายเป็น NameError เพราะ CPython ไม่ได้ว่าอย่างนั้น)
       */
      if (t.value === 'True' || t.value === 'False') {
        fail(
          'SyntaxError',
          `ยังไม่รองรับค่า ${t.value} โดยตรง — เขียนเงื่อนไขจริง เช่น me.hp_pct < 50`,
          t.line,
          t.col,
        );
      }
      if (t.value === 'None') {
        fail('SyntaxError', 'ยังไม่รองรับค่า None', t.line, t.col);
      }
      if (t.value === 'not' || t.value === 'and' || t.value === 'or') {
        fail('SyntaxError', `'${t.value}' อยู่ผิดที่ — ต้องมีค่ามาก่อนหน้า`, t.line, t.col);
      }
      // ที่เหลือ (def / if / elif / else / for / in / pass) ถูกใช้เป็นชื่อหรือค่า
      // เช่น attack(pass) หรือ me.hp + if — CPython ฟ้อง SyntaxError เราก็ต้องฟ้องเหมือนกัน
      this.failKeywordAsName(t, 'value');
    }
    if (t.type === 'NAME') {
      this.next();
      if (this.at('OP', '(')) {
        this.next();
        const args: Expr[] = [];
        if (!this.at('OP', ')')) {
          args.push(this.parseExpr());
          while (this.at('OP', ',')) {
            this.next();
            if (this.at('OP', ')')) break; // อนุญาต trailing comma เหมือน Python
            args.push(this.parseExpr());
          }
        }
        this.expectOp(')', `ลืมปิดวงเล็บของ ${t.value}(`);
        return { kind: 'call', func: t.value, args, line: t.line, col: t.col };
      }
      return { kind: 'name', id: t.value, line: t.line, col: t.col };
    }
    fail('SyntaxError', `ตรงนี้ต้องเป็นค่าหรือชื่อ แต่เจอ ${this.describe(t)}`, t.line, t.col);
  }
}

/** แปลงข้อความ BloxCode เป็น AST — ไม่โยน exception, ส่ง errors กลับมาแทน */
export function parse(source: string): ParseResult {
  try {
    const physicalLines = source.replace(/\r\n?/g, '\n').split('\n');
    // ตัดบรรทัดว่างท้ายไฟล์ออกก่อนนับ
    let count = physicalLines.length;
    while (count > 0 && physicalLines[count - 1].trim() === '') count--;
    if (count > MAX_PROGRAM_LINES) {
      fail(
        'SyntaxError',
        `โปรแกรมยาว ${count} บรรทัด เกินขีดจำกัด ${MAX_PROGRAM_LINES} บรรทัด — ตัดให้สั้นลงก่อน`,
        MAX_PROGRAM_LINES + 1,
        1,
      );
    }
    const { tokens, leadingComments } = tokenize(source);
    const parser = new Parser(tokens);
    const header = leadingComments.length ? leadingComments.join('\n') : undefined;
    const program = parser.parseProgram(header);
    return { program, errors: [] };
  } catch (e) {
    if (e instanceof LangErrorException) return { program: null, errors: [e.err] };
    throw e;
  }
}

/** true เมื่อ orelse ของ If นี้มาจาก `elif` (โครงเดียวกับ ast ของ CPython) */
export function isElifChain(node: Extract<Stmt, { kind: 'if' }>): boolean {
  return node.orelse.length === 1
    && node.orelse[0].kind === 'if'
    && node.orelse[0].col === node.col;
}
