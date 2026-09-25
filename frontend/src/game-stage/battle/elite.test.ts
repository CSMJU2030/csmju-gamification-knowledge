import { describe, expect, it } from 'vitest';
import type { RegionRun } from '@/lib/api/types';
import { eliteMismatch, eliteMismatchDetail, sameElite } from './elite';

function run(elite: RegionRun['elite']): RegionRun {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    regionId: 'forest',
    depth: 1,
    floor: 3,
    nameTh: 'ป่าเริ่มต้น',
    lessonTh: '',
    elite,
    expiresAt: '2026-09-25T00:00:00.000Z',
  };
}

const ex = { wave: 4, archetypeId: 'wolf', nameTh: 'หมาป่า EX' };

describe('sameElite', () => {
  it('ไม่มี EX ทั้งคู่ (null / undefined ถือว่าเท่ากัน)', () => {
    expect(sameElite(null, undefined)).toBe(true);
    expect(sameElite(undefined, undefined)).toBe(true);
  });
  it('มีฝั่งเดียว = ไม่ตรง', () => {
    expect(sameElite(ex, null)).toBe(false);
    expect(sameElite(undefined, ex)).toBe(false);
  });
  it('เทียบเวฟ ชนิด และชื่อ', () => {
    expect(sameElite(ex, { ...ex })).toBe(true);
    expect(sameElite(ex, { ...ex, wave: 5 })).toBe(false);
    expect(sameElite(ex, { ...ex, archetypeId: 'orc' })).toBe(false);
    expect(sameElite(ex, { ...ex, nameTh: 'ออร์ค EX' })).toBe(false);
  });
});

describe('eliteMismatch — คำประกาศตอนเข้าโซน vs สนามจริง', () => {
  it('ตรงกัน = ไม่แจ้ง', () => {
    expect(eliteMismatch(run(ex), run({ ...ex }))).toBe(false);
    expect(eliteMismatch(run(null), run(undefined))).toBe(false);
  });
  it('ไม่ตรง = แจ้ง', () => {
    expect(eliteMismatch(run(null), run(ex))).toBe(true);
    expect(eliteMismatch(run(ex), run({ ...ex, wave: 9 }))).toBe(true);
  });
  it('ผลที่ไม่มี announce (ไม่ใช่การรบในภูมิภาค) ไม่มีอะไรให้เทียบ', () => {
    expect(eliteMismatch(run(ex), undefined)).toBe(false);
  });
  it('ข้อความบอกทั้งสองฝั่งเป็นภาษาไทย', () => {
    expect(eliteMismatchDetail(run(null), run(ex))).toBe(
      'ประกาศไว้ว่า ไม่มี EX แต่รอบนี้ได้ หมาป่า EX — นี่เป็นข้อผิดพลาดของระบบ กรุณาแจ้งผู้ดูแลระบบ',
    );
  });
});
