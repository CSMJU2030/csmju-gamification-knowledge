/**
 * ผลตรวจบทเรียนของภูมิภาค (ระยะ S1) — ได้สกิลครั้งแรกต้องบอกโค้ดที่ใช้ได้ทันที · ยังไม่ผ่านต้องบอกทีละข้อ · รอบฝึกบอกว่าไม่นับ
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ลิงก์ของแอป prefetch ผ่าน router ของ Next — เทสต์นี้ไม่มี app router จึงให้ router ปลอมที่ไม่ทำอะไร
vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: () => {} }) }));
import type { RegionProof } from '@/lib/api/types';
import { castExample, castName } from '@/lib/game/labels';
import ProofPanel from './ProofPanel';

afterEach(cleanup);

const base: RegionProof = {
  regionId: 'greenwood',
  eligible: true,
  passed: true,
  newlyProved: true,
  checks: [
    { code: 'deepest_win', textTh: 'ชนะรอบ 4 (รอบลึกสุด)', ok: true },
    { code: 'handled', textTh: 'รับทัน 4/4 ครั้ง (ต้องทันทุกครั้ง)', ok: true },
  ],
  skill: { id: 'g_iron_guard', nameTh: 'การ์ดเหล็ก', kind: 'shield', mpCost: 8, aoe: false },
};

describe('ProofPanel', () => {
  it('ได้สกิลครั้งแรก: บอกชื่อสกิล โค้ดที่ใช้ได้ทันที และลิงก์ไปหน้าโปรแกรม', () => {
    render(<ProofPanel proof={base} regionName="ป่าเริ่มต้น" />);
    expect(screen.getByText('ได้สกิลใหม่')).toBeTruthy();
    expect(screen.getByText('cast("iron_guard", me)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'เปิดโปรแกรมเพื่อใส่สกิลใหม่' }).getAttribute('href')).toBe('/program');
  });

  it('ยังไม่ผ่าน: บอกทีละข้อว่าข้อไหนขาด (โปรแกรมอ่านหน้าจอได้ยินว่าผ่าน/ไม่ผ่าน)', () => {
    const proof: RegionProof = {
      ...base,
      passed: false,
      newlyProved: false,
      checks: [base.checks[0], { code: 'handled', textTh: 'รับทัน 2/3 ครั้ง (ต้องทันทุกครั้ง)', ok: false }],
    };
    render(<ProofPanel proof={proof} regionName="ป่าเริ่มต้น" />);
    expect(screen.getByText('ยังไม่ผ่าน')).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['ผ่าน: ชนะรอบ 4 (รอบลึกสุด)', 'ยังไม่ผ่าน: รับทัน 2/3 ครั้ง (ต้องทันทุกครั้ง)']);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('รอบฝึกบอกว่าไม่นับ · ผู้ฝึกหัดที่พิสูจน์ได้รู้ว่าได้สกิลตอนเลือกอาชีพ', () => {
    render(<ProofPanel proof={{ ...base, eligible: false, passed: false, newlyProved: false }} regionName="ป่าเริ่มต้น" />);
    expect(screen.getByText('รอบฝึก · ไม่นับ')).toBeTruthy();
    cleanup();
    render(<ProofPanel proof={{ ...base, skill: null }} regionName="ป่าเริ่มต้น" />);
    expect(screen.getByText(/เลือกอาชีพเมื่อไรได้สกิลของอาชีพนั้นทันที/)).toBeTruthy();
  });

  it('ตัวอย่างโค้ด: ท่าโจมตีใส่ศัตรู · โล่/ฮีลใส่ตัวเอง · ชื่อตัดคำนำหน้าอาชีพ', () => {
    expect(castName('w_crushing_blow')).toBe('crushing_blow');
    expect(castExample({ id: 'm_meteor', kind: 'magic' })).toBe('cast("meteor", weakest(enemies))');
    expect(castExample({ id: 'w_second_wind', kind: 'heal' })).toBe('cast("second_wind", me)');
  });
});
