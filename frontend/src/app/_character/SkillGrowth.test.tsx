/**
 * การ์ดทางได้สกิลบนหน้าตัวละคร (ระยะ S3 · S4) — บอกแต้มสายเทียบเกณฑ์ และเพดานดวงของตำราทุกเล่ม
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Character } from '@/lib/api/types';
import { LineSkillsCard, SkillBooksCard } from './SkillGrowth';

afterEach(cleanup);

const cleave = { id: 'w_cleave', nameTh: 'ผ่าพสุธา', kind: 'physical' as const, mpCost: 20, aoe: true };
const focus = { id: 'w_focus', nameTh: 'ตั้งสมาธิ', kind: 'heal' as const, mpCost: 12, aoe: false };
const character = {
  lines: [
    { line: 'str', earned: 24, threshold: 20, unlocked: true, skill: cleave },
    { line: 'int', earned: 3, threshold: 20, unlocked: false, skill: focus },
    { line: 'vit', earned: 0, threshold: 20, unlocked: false, skill: null },
  ],
  books: [
    { id: 'venom', nameTh: 'ตำราพิษ', mechanicTh: 'พิษ', owned: true, pity: 0, pityMax: 8, sourcesTh: ['ราชาสไลม์'], skill: null },
    { id: 'stun', nameTh: 'ตำรามึน', mechanicTh: 'มึน', owned: false, pity: 5, pityMax: 8, sourcesTh: ['เจ้าแห่งกระดูก', 'ยักษ์หิน EX'], skill: focus },
  ],
} as unknown as Character;

describe('LineSkillsCard', () => {
  it('สายที่ถึงเกณฑ์บอกว่าได้แล้ว · สายที่ยังไม่ถึงบอกแต้มเทียบเกณฑ์ · โค้ดตัวอย่างของสกิลวงกว้างเล็ง enemies', () => {
    render(<LineSkillsCard character={character} />);
    expect(screen.getByText('ได้แล้ว')).toBeTruthy();
    expect(screen.getByText('3 / 20 แต้ม')).toBeTruthy();
    expect(screen.getByText('cast("cleave", enemies)')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'แต้มสาย INT' }).getAttribute('aria-valuetext')).toBe('3 จาก 20 แต้ม');
  });
});

describe('SkillBooksCard', () => {
  it('เล่มที่เก็บแล้ว / ยังไม่ได้พร้อมเพดานดวงและต้นทาง', () => {
    render(<SkillBooksCard character={character} />);
    expect(screen.getByText('เก็บแล้ว')).toBeTruthy();
    expect(screen.getByText(/ล้มต้นทาง 5\/8/)).toBeTruthy();
    expect(screen.getByText('ดรอปจาก เจ้าแห่งกระดูก · ยักษ์หิน EX')).toBeTruthy();
    expect(screen.getByText(/ได้สกิลเมื่อเลือกอาชีพ/)).toBeTruthy();
  });
});
