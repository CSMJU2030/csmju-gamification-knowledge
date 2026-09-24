/**
 * ตัวช่วยสร้าง LangError — ใช้ร่วมกันทั้ง tokenizer / parser / validate / evaluator
 * ข้อความทุกอันเป็นภาษาไทยและต้องบอก "ผิดอะไร" + "แก้ยังไง"
 */
import type { ErrorName, LangError } from './spec';

/** ข้อผิดพลาดที่โยนออกมาระหว่างแปลภาษา (ถูกจับแล้วแปลงเป็น LangError เสมอ) */
export class LangErrorException extends Error {
  constructor(public readonly err: LangError) {
    super(`${err.name}: ${err.messageTh}`);
    this.name = 'LangErrorException';
  }
}

export function langError(
  name: ErrorName,
  messageTh: string,
  line: number,
  col: number,
): LangError {
  return { name, messageTh, line: Math.max(0, line), col: Math.max(0, col) };
}

export function fail(name: ErrorName, messageTh: string, line: number, col: number): never {
  throw new LangErrorException(langError(name, messageTh, line, col));
}

/** ระยะแก้ไข (Levenshtein) — ใช้เดาว่าผู้เล่นพิมพ์ชื่ออะไรผิด */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[n];
}

/**
 * ระยะที่ยอมให้เดาได้ — ขึ้นกับความยาวของคำที่ผู้เล่นพิมพ์
 *
 * เดิมยอมถึงระยะ 2 เสมอ ผลคือคำสั้น ๆ ถูกจับคู่กับคำที่ "ไม่เกี่ยวกันเลย"
 * เพราะระยะ 2 บนคำ 4 ตัวอักษรแทบไม่เหลือความเหมือน — รอบ 2T วัดได้ว่า
 * `flee()` ถูกแนะนำเป็น `len()` และ `rest()` ถูกแนะนำเป็น `cast()`
 * ผู้เล่นมือใหม่รายงานว่า "คำแนะนำมั่ว ๆ แย่กว่าไม่แนะนำเลย" เพราะเสียเวลาไปลองของผิด
 * คำยาว ๆ ยังยอมระยะ 2 ได้ เพราะยังเหลือตัวอักษรที่ตรงกันมากพอ
 * (`enemys`→`enemies`, `nearest`→`weakest` ซึ่งผู้เล่นคนเดียวกันบอกว่าช่วยได้จริง)
 */
function maxDistanceFor(target: string): number {
  return target.length <= 4 ? 1 : 2;
}

/**
 * หาชื่อที่ใกล้เคียงที่สุดจากรายการที่รู้จัก
 * คืน undefined เมื่อไม่มีอะไรใกล้พอ — จะได้ไม่เดามั่ว
 */
export function closestName(target: string, known: readonly string[]): string | undefined {
  const limit = maxDistanceFor(target);
  let best: string | undefined;
  let bestD = limit + 1;
  for (const k of known) {
    const d = editDistance(target.toLowerCase(), k.toLowerCase());
    if (d < bestD || (d === bestD && best !== undefined && k < best)) {
      if (d <= limit) {
        best = k;
        bestD = d;
      }
    }
  }
  return best;
}

/** ต่อท้ายข้อความด้วยคำแนะนำ "คุณหมายถึง ... หรือเปล่า?" ถ้าเดาได้ */
export function withSuggestion(base: string, target: string, known: readonly string[]): string {
  const s = closestName(target, known);
  return s ? `${base} — คุณหมายถึง '${s}' หรือเปล่า?` : base;
}
