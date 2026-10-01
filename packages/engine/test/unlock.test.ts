/**
 * บันไดการปลดล็อกต้องไปถึงได้จริง (รอบ 2F §3.3)
 *
 * เทสต์นี้มีไว้กันกับดักตัวเดียว: `arith: 13` ที่อยู่ในเกมมาหลายรอบขณะที่ชั้นสูงสุดคือ 10
 * ผู้เล่นเห็น "ต้องผ่านชั้น 13 ก่อน" — คำสัญญาที่เกมทำให้ไม่ได้ — และไม่มีใครรู้จนกว่า
 * จะมีคนเล่นจบจริงในรอบ 2T
 *
 * **ชั้นสูงสุดคำนวณจากข้อมูล ไม่ได้ฮาร์ดโค้ด** — ถ้าวันหนึ่งเกมเพิ่มโซนชั้น 15
 * เทสต์นี้ต้องยอมให้ปลดล็อกที่ชั้น 13 ได้เอง และถ้าวันหนึ่งตัดโซนสูง ๆ ออก
 * เทสต์นี้ต้องตกทันทีแทนที่จะปล่อยให้ค่าเก่าค้าง
 */
import { describe, expect, it } from 'vitest';
import { FEATURE_UNLOCK, type Feature } from '../src/lang/spec';
import { gamedata } from '../src/data';

/** ค่าที่หมายถึง "ปิดไว้โดยตั้งใจ" — แยกออกจาก "ไปไม่ถึงโดยบังเอิญ" ให้ชัด */
const DELIBERATELY_CLOSED = 999;

/** ชั้นสูงสุดที่ผู้เล่นไปถึงได้จริง = ชั้นท้ายสุดของโซนที่ลึกที่สุด */
function highestReachableFloor(): number {
  return Math.max(
    ...gamedata.regions
      .filter((r) => r.depths > 0)
      .map((r) => r.floorBase + r.depths - 1),
  );
}

describe('บันไดการปลดล็อก (2F §3.3)', () => {
  it('ชั้นสูงสุดของเกมคำนวณได้จากข้อมูลโซน', () => {
    // ถ้าข้อนี้ตก แปลว่าไม่มีโซนที่รบได้เลย — เทสต์ข้างล่างจะไม่มีความหมาย
    expect(highestReachableFloor()).toBeGreaterThan(0);
  });

  it('ทุกความสามารถที่เปิดได้ ต้องเปิดได้จริงก่อนจบเกม', () => {
    const top = highestReachableFloor();
    const unreachable = (Object.entries(FEATURE_UNLOCK) as [Feature, number][])
      .filter(([, floor]) => floor !== DELIBERATELY_CLOSED && floor > top)
      .map(([f, floor]) => `${f} ต้องผ่านชั้น ${floor} แต่เกมมีแค่ ${top} ชั้น`);
    expect(unreachable).toEqual([]);
  });

  it('ไม่มีความสามารถไหนเปิดตอนเกมจบพอดี — ต้องเหลือชั้นให้ได้ใช้', () => {
    // for เคยเปิดที่ชั้น 10 = ชั้นสุดท้าย ผู้เล่นได้มันตอนไม่มีอะไรให้ใช้แล้ว
    const top = highestReachableFloor();
    const tooLate = (Object.entries(FEATURE_UNLOCK) as [Feature, number][])
      .filter(([, floor]) => floor !== DELIBERATELY_CLOSED && floor >= top)
      .map(([f]) => f);
    expect(tooLate).toEqual([]);
  });

  it('บันไดเรียงจากง่ายไปยาก: if มาก่อน elif · เลขคณิตมาก่อนตัวแปร', () => {
    // ลำดับนี้คือเหตุผลในคอมเมนต์ของ spec.ts — ถ้าสลับกัน คอมเมนต์นั้นกลายเป็นคำโกหก
    expect(FEATURE_UNLOCK.if_else).toBeLessThan(FEATURE_UNLOCK.elif);
    expect(FEATURE_UNLOCK.arith).toBeLessThan(FEATURE_UNLOCK.variable);
    expect(FEATURE_UNLOCK.call).toBe(0);
  });
});
