/**
 * Tokenizer — เล็กซ์แบบ Python จริง
 *
 * รองรับ: INDENT / DEDENT จากช่องว่างหน้าบรรทัด, คอมเมนต์ `#`, ข้อความ '..' "..",
 * ตัวเลข, ชื่อ, ตัวดำเนินการ, NEWLINE ของบรรทัดตรรกะ, การต่อบรรทัดในวงเล็บ
 *
 * กติกาการเยื้อง: tab นับเป็น "ไปยังคอลัมน์ถัดไปที่หาร 4 ลงตัว" (tabstop 4)
 * ดังนั้น tab เดียวที่ต้นบรรทัด = 4 ช่อง ตรงกับที่ formatter ของเราใช้
 */
import { fail } from './errors';

/**
 * KEYWORD แยกจาก NAME ตั้งแต่ชั้นเล็กซ์ เพราะเป็นทางเดียวที่ทำให้ parser
 * "ลืมตรวจคำสงวน" ไม่ได้อีก: จุดไหนที่ต้องการชื่อจะขอ NAME ซึ่งคำสงวนไม่มีวันตรงเงื่อนไข
 * (เดิมคำสงวนถูก push เป็น NAME ทั้งหมด me.def / for if in ... จึงหลุดผ่าน parser
 *  แล้วไปโผล่เป็น NameError ตอน validate ทั้งที่ CPython ปฏิเสธตั้งแต่ตอน compile)
 */
export type TokType =
  | 'NAME' | 'KEYWORD' | 'NUMBER' | 'STRING' | 'OP'
  | 'NEWLINE' | 'INDENT' | 'DEDENT' | 'EOF';

export interface Token {
  type: TokType;
  /** ข้อความดิบของโทเคน (STRING = ค่าที่ถอด escape แล้ว) */
  value: string;
  line: number; // 1-based
  col: number;  // 1-based
}

export interface TokenizeResult {
  tokens: Token[];
  /** คอมเมนต์ที่อยู่ก่อน `def turn():` — เก็บไว้ round-trip (Program.header) */
  leadingComments: string[];
}

/**
 * คำที่จองไว้ — ผู้เล่นใช้เป็นชื่อตัวแปร / คุณสมบัติ / ฟังก์ชันไม่ได้ เหมือน CPython เป๊ะ
 * (คำสงวนตัวอื่นของ Python เช่น while / return อยู่ใน UNSUPPORTED_KEYWORDS ข้างล่าง
 *  เพราะต้องบอกเหตุผลเฉพาะตัว จึงถูกปฏิเสธตั้งแต่ตอนเล็กซ์ ไม่ต้องมาถึงชั้นนี้)
 */
export const KEYWORDS = new Set([
  'def', 'if', 'elif', 'else', 'for', 'in', 'and', 'or', 'not', 'pass',
  'True', 'False', 'None',
]);

/**
 * True / False / None ไม่ใช่ "คำสั่ง" แต่เป็นค่าคงที่ — CPython ฟ้องคนละข้อความ
 * (`cannot assign to True` ไม่ใช่ `invalid syntax`) จึงแยกไว้เพื่อเลือกคำอธิบายให้ตรง
 */
export const CONSTANT_KEYWORDS = new Set(['True', 'False', 'None']);

/**
 * คำ Python ที่ยังไม่รองรับในเฟสนี้ — ต้องบอกให้ชัดว่าทำไม
 *
 * รวมกับ KEYWORDS ข้างบนแล้วต้องครบ keyword.kwlist ของ CPython ทุกคำ ไม่มีตกหล่น
 * คำที่ตกหล่นจะถูกเล็กซ์เป็นชื่อธรรมดา แล้ว me.from / from = 5 จะผ่านล่ามเราทั้งที่
 * CPython ปฏิเสธ (เจอตอนตรวจงานรอบนี้: as/async/await/except/finally/from/nonlocal หายไปทั้งชุด)
 * เทสต์ใน differential.test.ts ดึงรายการจาก CPython ตัวจริงมาไล่ จึงกันการตกหล่นซ้ำ
 *
 * ไม่รวม soft keyword (match / case / _) เพราะ CPython ยังให้ใช้เป็นชื่อได้ตามปกติ
 */
const UNSUPPORTED_KEYWORDS: Record<string, string> = {
  while: 'ยังไม่รองรับ while (การวนแบบไม่รู้จบทำให้เกมค้าง) — ใช้ for แทน',
  return: 'ยังไม่รองรับ return — turn() สั่งการกระทำโดยตรง เช่น attack(...)',
  import: 'ยังไม่รองรับ import — BloxCode มีเฉพาะ API ของเกมเท่านั้น',
  class: 'ยังไม่รองรับ class ในเฟสนี้',
  lambda: 'ยังไม่รองรับ lambda ในเฟสนี้',
  try: 'ยังไม่รองรับ try / except ในเฟสนี้',
  raise: 'ยังไม่รองรับ raise ในเฟสนี้',
  global: 'ยังไม่รองรับ global ในเฟสนี้',
  break: 'ยังไม่รองรับ break ในเฟสนี้',
  continue: 'ยังไม่รองรับ continue ในเฟสนี้',
  yield: 'ยังไม่รองรับ yield ในเฟสนี้',
  with: 'ยังไม่รองรับ with ในเฟสนี้',
  assert: 'ยังไม่รองรับ assert ในเฟสนี้',
  del: 'ยังไม่รองรับ del ในเฟสนี้',
  is: "ยังไม่รองรับ 'is' — ใช้ == แทน",
  as: "ยังไม่รองรับ 'as' — เป็นคำสงวนของ Python ใช้เป็นชื่อไม่ได้",
  from: "ยังไม่รองรับ 'from' — BloxCode มีเฉพาะ API ของเกมเท่านั้น",
  async: "ยังไม่รองรับ 'async' ในเฟสนี้",
  await: "ยังไม่รองรับ 'await' ในเฟสนี้",
  except: "ยังไม่รองรับ 'except' — ยังไม่มี try / except ในเฟสนี้",
  finally: "ยังไม่รองรับ 'finally' — ยังไม่มี try / except ในเฟสนี้",
  nonlocal: "ยังไม่รองรับ 'nonlocal' ในเฟสนี้",
};

const TWO_CHAR_OPS = new Set(['<=', '>=', '==', '!=']);
const ONE_CHAR_OPS = new Set(['(', ')', ':', ',', '.', '+', '-', '*', '/', '<', '>', '=']);

/** ตัวดำเนินการที่ Python มีแต่เรายังไม่เปิด — บอกเหตุผลแทนที่จะบอกแค่ "syntax error" */
const REJECTED_OPS: Record<string, string> = {
  '**': 'ยังไม่รองรับเลขยกกำลัง **',
  '//': 'ยังไม่รองรับการหารปัดลง // — ใช้ / แทน',
  '%': 'ยังไม่รองรับ % (หารเอาเศษ)',
  '+=': 'ยังไม่รองรับ += — เขียนเป็น x = x + 1 แทน',
  '-=': 'ยังไม่รองรับ -= — เขียนเป็น x = x - 1 แทน',
  '*=': 'ยังไม่รองรับ *=',
  '/=': 'ยังไม่รองรับ /=',
  '[': 'ยังไม่รองรับลิสต์แบบ [ ] — ใช้ enemies / allies ที่เกมให้มา',
  ']': 'ยังไม่รองรับลิสต์แบบ [ ]',
  '{': 'ยังไม่รองรับ { }',
  '}': 'ยังไม่รองรับ { }',
  ';': 'ยังไม่รองรับ ; — เขียนคำสั่งละบรรทัด',
  '&': 'ยังไม่รองรับ & — ใช้ and แทน',
  '|': 'ยังไม่รองรับ | — ใช้ or แทน',
  '!': 'ยังไม่รองรับ ! — ใช้ not แทน (หรือ != สำหรับ "ไม่เท่ากับ")',
  '@': 'ยังไม่รองรับ @',
  '~': 'ยังไม่รองรับ ~',
  '^': 'ยังไม่รองรับ ^',
  '\\': 'ยังไม่รองรับการต่อบรรทัดด้วย \\ — เขียนให้จบในบรรทัดเดียว',
};

const isDigit = (ch: string) => ch >= '0' && ch <= '9';
const isIdentStart = (ch: string) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
const isIdentPart = (ch: string) => isIdentStart(ch) || isDigit(ch);

export function tokenize(source: string): TokenizeResult {
  const src = source.replace(/\r\n?/g, '\n');
  const tokens: Token[] = [];
  const leadingComments: string[] = [];
  const indents: number[] = [0];

  let i = 0;
  let line = 1;
  let lineStart = 0; // index ของอักขระแรกในบรรทัดปัจจุบัน
  let parenDepth = 0;
  let atLineStart = true;
  let sawRealToken = false;
  let logicalLineHasContent = false;

  const col = () => i - lineStart + 1;
  const push = (type: TokType, value: string, l: number, c: number) => {
    tokens.push({ type, value, line: l, col: c });
  };

  while (i < src.length) {
    if (atLineStart && parenDepth === 0) {
      // ---- วัดการเยื้องของบรรทัดตรรกะใหม่ ----
      let width = 0;
      let j = i;
      for (;;) {
        const ch = src[j];
        if (ch === ' ') { width += 1; j++; }
        else if (ch === '\t') { width += 4 - (width % 4); j++; }
        else break;
      }
      const rest = src[j];
      if (rest === undefined || rest === '\n' || rest === '#') {
        // บรรทัดว่างหรือมีแต่คอมเมนต์ → ไม่นับการเยื้อง (เหมือน Python)
        if (rest === '#') {
          let k = j;
          while (k < src.length && src[k] !== '\n') k++;
          const text = src.slice(j, k);
          if (!sawRealToken) leadingComments.push(text.trimEnd());
          j = k;
        }
        i = j;
        if (src[i] === '\n') { i++; line++; lineStart = i; }
        continue;
      }
      const top = indents[indents.length - 1];
      if (width > top) {
        indents.push(width);
        push('INDENT', ' '.repeat(width), line, 1);
      } else if (width < top) {
        while (indents.length > 1 && indents[indents.length - 1] > width) {
          indents.pop();
          push('DEDENT', '', line, width + 1);
        }
        if (indents[indents.length - 1] !== width) {
          fail(
            'IndentationError',
            'การเยื้องไม่ตรงกับระดับใด ๆ ก่อนหน้า — ใช้ 4 ช่องต่อ 1 ระดับให้เท่ากันทั้งไฟล์',
            line,
            width + 1,
          );
        }
      }
      i = j;
      atLineStart = false;
      logicalLineHasContent = false;
      continue;
    }

    const ch = src[i];

    if (ch === '\n') {
      i++;
      if (parenDepth > 0) { line++; lineStart = i; continue; } // ต่อบรรทัดในวงเล็บ
      if (logicalLineHasContent) push('NEWLINE', '\n', line, col());
      logicalLineHasContent = false;
      line++;
      lineStart = i;
      atLineStart = true;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\f') { i++; continue; }

    if (ch === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    const startLine = line;
    const startCol = col();

    // ---- ข้อความ ----
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let out = '';
      for (;;) {
        if (i >= src.length || src[i] === '\n') {
          fail('SyntaxError', 'ข้อความยังไม่ปิดเครื่องหมายคำพูด — ใส่ " ปิดท้ายด้วย', startLine, startCol);
        }
        const c = src[i];
        if (c === '\\') {
          const nxt = src[i + 1];
          if (nxt === 'n') out += '\n';
          else if (nxt === 't') out += '\t';
          else if (nxt === '\\') out += '\\';
          else if (nxt === '"') out += '"';
          else if (nxt === "'") out += "'";
          else {
            fail('SyntaxError', `ไม่รู้จักลำดับหลบหนี '\\${nxt ?? ''}' ในข้อความ`, line, col());
          }
          i += 2;
          continue;
        }
        if (c === quote) { i++; break; }
        out += c;
        i++;
      }
      push('STRING', out, startLine, startCol);
      sawRealToken = true;
      logicalLineHasContent = true;
      continue;
    }

    // ---- ตัวเลข ----
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1]) && !logicalLineHasContent)) {
      let j = i;
      while (j < src.length && isDigit(src[j])) j++;
      if (src[j] === '.' && isDigit(src[j + 1])) {
        j++;
        while (j < src.length && isDigit(src[j])) j++;
      }
      if (src[j] !== undefined && isIdentStart(src[j])) {
        fail('SyntaxError', 'ตัวเลขติดกับตัวอักษร — ใส่ช่องว่างหรือตัวดำเนินการคั่น', line, col());
      }
      push('NUMBER', src.slice(i, j), startLine, startCol);
      i = j;
      sawRealToken = true;
      logicalLineHasContent = true;
      continue;
    }

    // ---- ชื่อ / คำสงวน ----
    if (isIdentStart(ch)) {
      let j = i;
      while (j < src.length && isIdentPart(src[j])) j++;
      const word = src.slice(i, j);
      const banned = UNSUPPORTED_KEYWORDS[word];
      if (banned) fail('SyntaxError', banned, startLine, startCol);
      push(KEYWORDS.has(word) ? 'KEYWORD' : 'NAME', word, startLine, startCol);
      i = j;
      sawRealToken = true;
      logicalLineHasContent = true;
      continue;
    }

    // ---- ตัวดำเนินการ ----
    const two = src.slice(i, i + 2);
    if (REJECTED_OPS[two]) fail('SyntaxError', REJECTED_OPS[two], startLine, startCol);
    if (TWO_CHAR_OPS.has(two)) {
      push('OP', two, startLine, startCol);
      i += 2;
      sawRealToken = true;
      logicalLineHasContent = true;
      continue;
    }
    if (ONE_CHAR_OPS.has(ch)) {
      if (ch === '(') parenDepth++;
      if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      push('OP', ch, startLine, startCol);
      i++;
      sawRealToken = true;
      logicalLineHasContent = true;
      continue;
    }
    if (REJECTED_OPS[ch]) fail('SyntaxError', REJECTED_OPS[ch], startLine, startCol);
    fail('SyntaxError', `ใช้อักขระ '${ch}' ไม่ได้ในโปรแกรม`, startLine, startCol);
  }

  if (parenDepth > 0) {
    fail('SyntaxError', 'วงเล็บ ( ยังไม่ถูกปิด — ใส่ ) ให้ครบ', line, col());
  }
  if (logicalLineHasContent) push('NEWLINE', '\n', line, col());
  while (indents.length > 1) {
    indents.pop();
    push('DEDENT', '', line, 1);
  }
  push('EOF', '', line, 1);

  return { tokens, leadingComments };
}
