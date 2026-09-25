/**
 * ตรวจคำสัญญาเรื่องมอน EX ของรอบในภูมิภาค (ย้ายจาก client/src/pages/WorldRunScreen.tsx)
 *
 * EX ต้องเป็น "การสุ่มครั้งเดียวกัน" ระหว่างคำประกาศตอนกดเข้าโซนกับสนามจริง — เซิร์ฟเวอร์ทำให้จริง
 * โดยโครงสร้าง (seed คิดจากแถวทะเบียนเดิม) ถ้าไม่ตรงขึ้นมา แปลว่าโครงนั้นพัง = บั๊กของเซิร์ฟเวอร์
 * ที่ทำลายคำสัญญาหลักของเกม จึงต้องโผล่ให้เห็นชัด ห้ามกลืนเงียบ ๆ
 * (คู่ดวลเปลี่ยนได้ตามสเปก — EX เปลี่ยนไม่ได้)
 */
import type { RegionRun } from '@/lib/api/types';

type Elite = NonNullable<RegionRun['elite']>;

/** undefined กับ null ถือว่า "ไม่มี EX" เหมือนกัน (field เป็น optional + nullable ในสัญญา API) */
export function sameElite(a: Elite | null | undefined, b: Elite | null | undefined): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null || y === null) return x === y;
  return x.wave === y.wave && x.archetypeId === y.archetypeId && x.nameTh === y.nameTh;
}

/**
 * true = EX ที่ลงสนามไม่ตรงกับที่ประกาศไว้ตอนกดเข้า
 * ผลการรบที่ไม่มี `announce` (ไม่ใช่การรบในภูมิภาค) ไม่มีอะไรให้เทียบ → ไม่ถือว่าผิด
 */
export function eliteMismatch(announcedAtEnter: RegionRun, announce: RegionRun | undefined): boolean {
  if (!announce) return false;
  return !sameElite(announcedAtEnter.elite, announce.elite);
}

/** ข้อความรายละเอียดของ Alert — บอกทั้งสองฝั่งให้ผู้ใช้แจ้งปัญหาได้ถูก */
export function eliteMismatchDetail(announcedAtEnter: RegionRun, announce: RegionRun): string {
  const before = announcedAtEnter.elite ? announcedAtEnter.elite.nameTh : 'ไม่มี EX';
  const after = announce.elite ? announce.elite.nameTh : 'ไม่มี EX';
  return `ประกาศไว้ว่า ${before} แต่รอบนี้ได้ ${after} — นี่เป็นข้อผิดพลาดของระบบ กรุณาแจ้งผู้ดูแลระบบ`;
}
