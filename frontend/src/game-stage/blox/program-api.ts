/**
 * เรียก GET/PATCH /programs/current (แทน programApi.ts เดิมที่ใช้ GET/PUT /program)
 *
 * ทั้งสองทางใช้ `api` กลางตัวเดียวกับหน้าอื่น จึงได้การจัดการ 401 → SSO แบบเดียวกัน
 *
 * กฎข้อ 3 ของ schema.ts บังคับว่าถ้าเซิร์ฟเวอร์ปฏิเสธ ต้องแสดงสิ่งที่มันบอกมา ไม่ใช่สิ่งที่เราเดาเอง
 * ของเดิมได้ `langErrors` เป็นวัตถุมาตรง ๆ แต่สัญญาใหม่ตาม api-conventions ให้ `details` เป็น string[]
 * backend จึงอัดข้อผิดพลาดแต่ละตัวเป็นข้อความรูปตายตัว `"บรรทัด:คอลัมน์:ชื่อ:ข้อความไทย"`
 * ไฟล์นี้แกะกลับเป็นรายการที่ ErrorPanel แสดงและไฮไลต์บรรทัดได้
 *
 * ไฟล์นี้ต้องไม่ import ล่ามจาก engine (import ได้แค่ type) — หน้า /program ใช้มันก่อนเอดิเตอร์โหลดเสร็จ
 * ถ้าดึงล่ามมาด้วย การแยก chunk ของเอดิเตอร์ด้วย next/dynamic จะไม่มีความหมาย
 */
import { ApiError, api } from '@/lib/api/client';
import type { Challenge, Program } from '@/lib/api/types';
import { groupErrors, type GroupedError } from './schema';

export type { Program };

/** ข้อผิดพลาดหนึ่งตัวที่แกะจาก details (รูปเดียวกับ LangError ของ engine) */
export interface DetailError {
  line: number;
  col: number;
  name: string;
  messageTh: string;
  /**
   * ชื่อฟิลด์ที่นำหน้ามา (ถ้ามี) เช่น `"starterSource: 3:5:SyntaxError:..."` จากฟอร์มโจทย์
   * ที่นี่ไม่ได้ใช้ แต่ตัวแกะรับไว้ด้วยเพื่อให้หน้าฟอร์มโจทย์ใช้ตัวเดียวกันได้
   */
  field?: string;
}

/**
 * `^(ฟิลด์: )?บรรทัด:คอลัมน์:ชื่อ:ข้อความ$`
 *
 * ทำไมไม่ใช้ split(':'): ข้อความไทยของ engine มี `:` อยู่ข้างในบ่อย (เช่น "ต้องมี : หลัง if")
 * split แล้วเอาช่องที่ 4 จะได้ข้อความขาดครึ่ง — จึงจับแค่สามช่องแรกให้แน่น แล้วที่เหลือทั้งหมดคือข้อความ
 * ชื่อข้อผิดพลาดบังคับขึ้นต้นด้วยตัวอักษร เพื่อไม่ให้สับสนกับเลขบรรทัด/คอลัมน์
 */
const DETAIL_RE = /^\s*(?:([A-Za-z_][\w.]*):\s+)?(\d+):(\d+):([A-Za-z][\w]*):\s?([\s\S]*)$/;

export function parseErrorDetail(detail: string): DetailError | null {
  const m = DETAIL_RE.exec(detail);
  if (!m) return null;
  const [, field, line, col, name, message] = m;
  return {
    line: Number(line),
    col: Number(col),
    name,
    messageTh: message.trim(),
    ...(field ? { field } : {}),
  };
}

export interface ServerRejection {
  /** ข้อผิดพลาดที่ชี้บรรทัดได้ — ยุบซ้ำด้วย groupErrors() ของ PM แล้ว */
  errors: GroupedError[];
  /**
   * ข้อความที่ไม่ได้อยู่ในรูปมาตรฐาน (เช่นมาจาก ValidationPipe: "source ต้องเป็นข้อความ")
   * ต้องแสดงด้วย ไม่งั้นผู้เล่นเห็นแค่ "บันทึกไม่ได้" โดยไม่รู้เหตุผล
   */
  notes: string[];
}

export function detailsToRejection(details: readonly string[]): ServerRejection {
  const parsed: DetailError[] = [];
  const notes: string[] = [];
  for (const d of details) {
    const e = parseErrorDetail(d);
    if (e) parsed.push(e);
    else if (d.trim() !== '') notes.push(d.trim());
  }
  return { errors: groupErrors(parsed), notes };
}

/** เซิร์ฟเวอร์ปฏิเสธเพราะโปรแกรมผิด (400 VALIDATION_ERROR) — พกรายการที่แกะแล้วมาให้แสดงตรง ๆ */
export class ProgramRejected extends Error {
  readonly rejection: ServerRejection;
  constructor(message: string, rejection: ServerRejection) {
    super(message);
    this.name = 'ProgramRejected';
    this.rejection = rejection;
  }
}

export const getProgram = (signal?: AbortSignal): Promise<Program> =>
  api.get<Program>('/programs/current', undefined, signal);

export async function saveProgram(source: string): Promise<Program> {
  try {
    return await api.patch<Program>('/programs/current', { source });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
      const rejection = detailsToRejection(e.details);
      // details ว่างทั้งก้อนก็ยังต้องบอกอะไรสักอย่าง — ใช้ข้อความของ backend เป็นหมายเหตุ
      if (rejection.errors.length === 0 && rejection.notes.length === 0) rejection.notes.push(e.message);
      throw new ProgramRejected(e.message, rejection);
    }
    throw e;
  }
}

/** โจทย์ที่ลิงก์มาด้วย `?starter=<id>` — ใช้แค่ชื่อกับโปรแกรมตั้งต้น */
export const getChallenge = (id: string, signal?: AbortSignal): Promise<Challenge> =>
  api.get<Challenge>(`/challenges/${encodeURIComponent(id)}`, undefined, signal);
