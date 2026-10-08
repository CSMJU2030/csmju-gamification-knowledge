import { describe, expect, it } from 'vitest';
import type { Region } from '@/lib/api/types';
import {
  clockTrusted,
  defaultDepth,
  depthReason,
  enterBlockReason,
  errorStateMessage,
  floorOfDepth,
  formatCountdown,
  hotspotLabel,
  hotspotPosition,
  liftWidth,
  lockedReason,
  progressText,
  regionStatus,
  remainingMs,
  spokenCountdown,
} from './logic';

/** โซนตัวอย่างตาม gamedata จริง (frostland: floorBase 5 · 5 รอบ) — แก้เฉพาะช่องที่แต่ละเทสต์สนใจ */
function region(over: Partial<Region> = {}): Region {
  return {
    id: 'frostland',
    nameTh: 'ดินแดนน้ำแข็ง',
    floorBase: 5,
    depths: 5,
    floorRange: [5, 9],
    lessonTh: 'บทเรียน',
    eliteChance: 0.12,
    hotspot: { x: 0.655, y: 0.255, r: 0.07 },
    depthCleared: 0,
    maxDepthAllowed: 1,
    completed: false,
    unlocked: true,
    proof: null,
    playersHere: 0,
    ...over,
  };
}

describe('สถานะของโซน', () => {
  it('เมือง (depths 0) เป็น town เสมอ แม้ backend จะบอกว่าปลดล็อก', () => {
    expect(regionStatus(region({ depths: 0, unlocked: true }))).toBe('town');
  });
  it('แยก ล็อก / ยังไม่เคยผ่าน / กำลังไป / ผ่านครบ', () => {
    expect(regionStatus(region({ unlocked: false, maxDepthAllowed: 0 }))).toBe('locked');
    expect(regionStatus(region())).toBe('open');
    expect(regionStatus(region({ depthCleared: 2, maxDepthAllowed: 3 }))).toBe('progress');
    expect(regionStatus(region({ depthCleared: 5, maxDepthAllowed: 5, completed: true }))).toBe('done');
  });
});

describe('เหตุผลตอน disable ปุ่ม "เข้าโซน" (G0 ข้อ 4)', () => {
  it('โซนล็อก → "ต้องผ่านความยาก X ก่อน" โดย X = floorBase - 1 (ตรงกับ backend 409)', () => {
    const locked = region({ unlocked: false, maxDepthAllowed: 0 });
    expect(lockedReason(locked)).toBe('ต้องผ่านความยาก 4 ก่อน');
    expect(enterBlockReason(locked, 1)).toBe('ต้องผ่านความยาก 4 ก่อน');
    expect(lockedReason(region({ floorBase: 6, unlocked: false }))).toBe('ต้องผ่านความยาก 5 ก่อน');
  });

  it('โซนล็อกบอกเรื่องล็อกก่อนเรื่องรอบเกิน', () => {
    expect(enterBlockReason(region({ unlocked: false, maxDepthAllowed: 0 }), 3)).toBe('ต้องผ่านความยาก 4 ก่อน');
  });

  it('รอบเกิน maxDepthAllowed → "ตอนนี้เข้าได้ถึงรอบที่ m"', () => {
    const r = region({ depthCleared: 1, maxDepthAllowed: 2 });
    expect(depthReason(r, 3)).toBe('ตอนนี้เข้าได้ถึงรอบที่ 2');
    expect(enterBlockReason(r, 3)).toBe('ตอนนี้เข้าได้ถึงรอบที่ 2');
  });

  it('รอบที่อยู่ในช่วงกดได้ → ไม่มีเหตุผล', () => {
    const r = region({ depthCleared: 1, maxDepthAllowed: 2 });
    expect(enterBlockReason(r, 1)).toBeNull();
    expect(enterBlockReason(r, 2)).toBeNull();
  });

  it('โซนที่ปลดล็อกแล้วไม่มีเหตุผลเรื่องล็อก · เมืองกดเข้าไม่ได้เสมอ', () => {
    expect(lockedReason(region())).toBeNull();
    expect(enterBlockReason(region({ depths: 0, maxDepthAllowed: 0 }), 1)).toBe('ที่นี่ไม่มีการรบ');
  });

  it('บรรทัดความคืบหน้าในรายการใช้เหตุผลเดียวกับปุ่ม', () => {
    expect(progressText(region({ unlocked: false, maxDepthAllowed: 0 }))).toBe('ต้องผ่านความยาก 4 ก่อน');
    expect(progressText(region({ depthCleared: 2, maxDepthAllowed: 3 }))).toBe('ผ่านแล้ว 2/5 รอบ');
    expect(progressText(region({ depths: 0 }))).toBe('เมือง ไม่มีการรบ');
  });
});

describe('รอบที่เลือกไว้ให้ตอนเปิดการ์ด', () => {
  it('เริ่มที่รอบลึกสุดที่เข้าได้', () => {
    expect(defaultDepth(region({ maxDepthAllowed: 3 }))).toBe(3);
  });
  it('ไม่ต่ำกว่า 1 และไม่เกินจำนวนรอบ', () => {
    expect(defaultDepth(region({ maxDepthAllowed: 0 }))).toBe(1);
    expect(defaultDepth(region({ depths: 5, maxDepthAllowed: 9 }))).toBe(5);
  });
  it('รอบที่ d = ความยาก floorBase + d - 1', () => {
    expect(floorOfDepth(region(), 1)).toBe(5);
    expect(floorOfDepth(region(), 5)).toBe(9);
  });
});

describe('ตำแหน่ง hotspot บนภาพ', () => {
  it('แปลงสัดส่วน 0..1 เป็น % ของกรอบ', () => {
    expect(hotspotPosition({ x: 0.372, y: 0.492, r: 0.062 })).toEqual({ left: '37.20%', top: '49.20%' });
    expect(hotspotPosition({ x: 0, y: 1, r: 0 })).toEqual({ left: '0.00%', top: '100.00%' });
  });
  it('ค่าหลุดช่วงถูกหนีบไว้ในกรอบ · ค่าที่ไม่ใช่ตัวเลขไปอยู่กลางภาพ', () => {
    expect(hotspotPosition({ x: 1.4, y: -0.2, r: 0.05 })).toEqual({ left: '100.00%', top: '0.00%' });
    expect(hotspotPosition({ x: Number.NaN, y: Number.POSITIVE_INFINITY, r: 0.05 })).toEqual({
      left: '50.00%',
      top: '50.00%',
    });
  });
  it('วงยกผืนดินกว้าง 3 เท่าของรัศมี (เป็น %) มีพื้นขั้นต่ำ 88px', () => {
    expect(liftWidth({ x: 0.5, y: 0.5, r: 0.07 })).toBe('max(21.0%, 88px)');
    expect(liftWidth({ x: 0.5, y: 0.5, r: -1 })).toBe('max(0.0%, 88px)');
  });
  it('aria-label ของจุดบอกชื่อ + สถานะ + คนในโซน', () => {
    expect(hotspotLabel(region({ unlocked: false, maxDepthAllowed: 0 }))).toBe(
      'ดินแดนน้ำแข็ง · ล็อก ต้องผ่านความยาก 4 ก่อน',
    );
    expect(hotspotLabel(region({ depthCleared: 2, maxDepthAllowed: 3, playersHere: 3 }))).toBe(
      'ดินแดนน้ำแข็ง · เข้าได้ ผ่านแล้ว 2 จาก 5 รอบ · มีผู้เล่นอยู่ 3 คน',
    );
    expect(hotspotLabel(region({ depthCleared: 5, maxDepthAllowed: 5, completed: true }))).toBe(
      'ดินแดนน้ำแข็ง · ผ่านแล้วครบ 5 รอบ',
    );
    expect(hotspotLabel(region({ nameTh: 'เมือง', depths: 0 }))).toBe('เมือง · เมือง ไม่มีการรบ');
  });
});

describe('นับถอยหลังถึง expiresAt', () => {
  const expiresAt = '2026-09-24T10:05:00.000Z';
  const at = (iso: string) => Date.parse(iso);

  it('เหลือเวลาเป็น ms และไม่ติดลบ', () => {
    expect(remainingMs(expiresAt, at('2026-09-24T10:00:00.000Z'))).toBe(300_000);
    expect(remainingMs(expiresAt, at('2026-09-24T10:06:00.000Z'))).toBe(0);
  });
  it('expiresAt อ่านไม่ออก = ถือว่าหมดแล้ว', () => {
    expect(remainingMs('ไม่ใช่วันที่', 0)).toBe(0);
  });
  it('แสดงแบบ m:ss และปัดวินาทีขึ้น (ยังเหลือเสี้ยววินาทีต้องไม่ขึ้น 0:00)', () => {
    expect(formatCountdown(300_000)).toBe('5:00');
    expect(formatCountdown(245_000)).toBe('4:05');
    expect(formatCountdown(59_001)).toBe('1:00');
    expect(formatCountdown(400)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5_000)).toBe('0:00');
  });
  it('แบบอ่านออกเสียง', () => {
    expect(spokenCountdown(245_000)).toBe('4 นาที 5 วินาที');
    expect(spokenCountdown(120_000)).toBe('2 นาที');
    expect(spokenCountdown(9_000)).toBe('9 วินาที');
  });
  it('นาฬิกาเครื่องเชื่อได้เมื่อรอบยังไม่หมดอายุตอนได้รับ', () => {
    expect(clockTrusted(expiresAt, at('2026-09-24T10:00:01.000Z'))).toBe(true);
    // เครื่องเดินเร็วกว่าเซิร์ฟเวอร์เกินอายุรอบ — ไม่นับถอยหลังเอง
    expect(clockTrusted(expiresAt, at('2026-09-24T10:20:00.000Z'))).toBe(false);
  });
});

describe('ข้อความของ ErrorState', () => {
  it('INTERNAL_ERROR ใช้ข้อความมาตรฐานของ ErrorState · code อื่นใช้ข้อความจริงของมัน', () => {
    expect(errorStateMessage({ code: 'INTERNAL_ERROR', message: 'ระบบขัดข้องชั่วคราว' })).toBeUndefined();
    expect(errorStateMessage({ code: 'NETWORK_ERROR', message: 'เชื่อมต่อระบบไม่ได้' })).toBe('เชื่อมต่อระบบไม่ได้');
  });
});
