/**
 * ส่งผลการรบจากหน้าที่กด "เริ่มรบ" (/tower · /world/run · /challenges/:id) ไปหน้าเวทีรบ (/battle)
 *
 * ผลการรบคำนวณครั้งเดียวที่ backend ตอน POST /battles แล้วบันทึกทันที — หน้า /battle แค่ "เล่นซ้ำ" บันทึกนั้น
 * จึงเก็บไว้ในหน่วยความจำของแท็บอย่างเดียว (โหลดหน้าใหม่ = ผลหายจากจอ แต่ของที่ได้อยู่ในกระเป๋าแล้ว
 * และดูย้อนได้ที่ /battles) · ไม่มี token หรือข้อมูลลับในนี้
 */
import { useSyncExternalStore } from 'react';
import type { BattleOutcome, Character, RegionRun } from '@/lib/api/types';

export type PendingBattle =
  | {
      kind: 'tower';
      floor: number;
      outcome: BattleOutcome;
      /** ตัวละครก่อนรบ — ฉากใช้ HP/MP ตั้งต้นและค่าสเตตัสเดิมเทียบกับที่ได้ */
      before: Character;
    }
  | {
      kind: 'region';
      /** คำประกาศตอนกดเข้า (ไว้เทียบว่า EX/คู่ดวลตรงกับที่ประกาศ) */
      run: RegionRun;
      regionName: string;
      outcome: BattleOutcome;
      before: Character;
    }
  | {
      /** สู้กับมอนของโจทย์ (docs/design-challenge-monsters.md) — เวฟเดียว */
      kind: 'challenge';
      challengeId: string;
      title: string;
      /** เลเวลสูงสุดของมอนในโจทย์ — ใช้เมื่อหาเลเวลรายตัวไม่เจอ */
      enemyLevel: number;
      /** เลเวลของมอนแต่ละตัว (id ใน result = `challengeMonsterId`) — มอนของโจทย์ตั้งเลเวลต่างกันได้ */
      enemyLevels: Record<string, number>;
      outcome: BattleOutcome;
      before: Character;
    };

let current: PendingBattle | null = null;
const listeners = new Set<() => void>();

export function setPendingBattle(b: PendingBattle | null): void {
  current = b;
  for (const l of listeners) l();
}

export function getPendingBattle(): PendingBattle | null {
  return current;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePendingBattle(): PendingBattle | null {
  return useSyncExternalStore(subscribe, getPendingBattle, () => null);
}
