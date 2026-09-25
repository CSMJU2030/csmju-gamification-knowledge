/**
 * ส่งรอบที่เพิ่งเข้า (ผลของ POST /region-runs) จาก /world ไปหน้าคำประกาศ /world/run
 *
 * เก็บในหน่วยความจำของแท็บอย่างเดียว แบบเดียวกับ `@/lib/game/battle-store`:
 * รอบมีอายุแค่ไม่กี่นาทีและผูกกับการตัดสินใจครั้งเดียว โหลดหน้าใหม่แล้วหายก็ถูกแล้ว
 * (หน้า /world/run พากลับแผนที่ให้เข้าใหม่) · ไม่มี token หรือข้อมูลลับในนี้
 */
import { useSyncExternalStore } from 'react';
import type { RegionRun } from '@/lib/api/types';

export interface StoredRegionRun {
  run: RegionRun;
  regionName: string;
  /** เวลาเครื่องตอนได้รอบมา — ใช้ตัดสินว่านาฬิกาเครื่องเชื่อได้ไหมก่อนนับถอยหลังเอง (ดู clockTrusted) */
  receivedAt: number;
}

let current: StoredRegionRun | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setRegionRun(r: StoredRegionRun | null): void {
  current = r;
  emit();
}

/**
 * ล้างเฉพาะเมื่อยังเป็นรอบเดิม — หน้าคำประกาศล้างของตัวเองตอนถูกถอด
 * ถ้าระหว่างนั้นผู้เล่นเข้ารอบใหม่จากอีกหน้าไปแล้ว ต้องไม่ลบรอบใหม่ทิ้ง
 */
export function clearRegionRun(runId: string): void {
  if (current?.run.id !== runId) return;
  current = null;
  emit();
}

export function getRegionRun(): StoredRegionRun | null {
  return current;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRegionRun(): StoredRegionRun | null {
  return useSyncExternalStore(subscribe, getRegionRun, () => null);
}
