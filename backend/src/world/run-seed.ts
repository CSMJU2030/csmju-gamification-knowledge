/**
 * seed ของรอบในภูมิภาค = ฟังก์ชันบริสุทธิ์ของ (ตัวละคร, ภูมิภาค, depth, เวลาที่เข้า) (รอบ 2W §8.1)
 * ทุกช่องอยู่ในแถว region_runs ครบ ตอนสู้จึงคิด seed ก้อนเดิมได้เสมอ — EX ที่ประกาศกับ EX
 * ที่ลงสนามเป็นการสุ่มครั้งเดียวกันโดยโครงสร้าง
 *
 * ตัวเลขประจำตัวละครคือ `seq` (ลำดับการสร้าง) ไม่ใช่ UUID เพราะ hashSeed กินตัวเลข 32 บิต
 */
import { hashSeed } from '@tower/engine';

/** ชื่อโซนเป็นข้อความ — ป้อนทีละอักขระเข้าตัวแฮชของ engine (ไม่เขียนตัวแฮชข้อความขึ้นใหม่) */
export function textSeed(s: string): number {
  return hashSeed(...Array.from(s, (ch) => ch.charCodeAt(0)));
}

export interface RunKey {
  characterSeq: number;
  regionId: string;
  depth: number;
  enteredAt: Date;
}

export function runSeed(run: RunKey): number {
  return hashSeed(run.characterSeq, textSeed(run.regionId), run.depth, run.enteredAt.getTime());
}

/** ลงโซนคนเดียวเสมอในรอบนี้ — เป็นค่าคงที่ที่มีชื่อเพราะเข้าไปอยู่ในสูตร seed ของการรบ */
export const PARTY_SIZE = 1;

/** id ของตัวละครในการดวล — ผูกกับตัวละคร/สแนปช็อต ไม่ใช่กับ "ใครเป็นคนเรียก" */
export const liveId = (characterSeq: number) => `u${characterSeq}`;
export const snapId = (snapshotSeq: number) => `s${snapshotSeq}`;
