/**
 * สิ่งที่การรบให้กับสกิล (ระยะ S2–S4) — ได้อะไรต้องบอกพร้อมโค้ดที่ใช้ได้ · ไม่นับต้องบอกเหตุผล · ไม่มีอะไร = ไม่แสดง
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BattleOutcome } from '@/lib/api/types';
import SkillGainsPanel from './SkillGainsPanel';

afterEach(cleanup);

type Gains = NonNullable<BattleOutcome['skills']>;
const empty: Gains = { mastery: [], newSkills: [], books: { dropped: [], progress: [] } };
const venomEdge = { id: 'w_venom_edge', nameTh: 'คมพิษ', kind: 'physical' as const, mpCost: 10, aoe: false };

describe('SkillGainsPanel', () => {
  it('ไม่มีอะไรเกิดขึ้น = ไม่แสดงกล่องเลย', () => {
    const { container } = render(<SkillGainsPanel gains={empty} />);
    expect(container.innerHTML).toBe('');
  });

  it('ได้ตำรา: บอกชื่อเล่ม กลไก และโค้ดของสกิลที่ได้ — สกิลเดียวกันไม่ประกาศซ้ำในสกิลใหม่', () => {
    render(
      <SkillGainsPanel
        gains={{
          ...empty,
          newSkills: [{ ...venomEdge, source: 'book' }],
          books: { dropped: [{ id: 'venom', nameTh: 'ตำราพิษ', mechanicTh: 'พิษ', skill: venomEdge }], progress: [] },
        }}
      />,
    );
    expect(screen.getByText('ได้ตำราพิษ')).toBeTruthy();
    expect(screen.getByText('cast("venom_edge", weakest(enemies))')).toBeTruthy();
    expect(screen.queryByText(/ได้สกิลใหม่/)).toBeNull();
  });

  it('ขึ้นขั้น 2 และสกิลสายใหม่ประกาศชัด · สกิลวงกว้างได้ตัวอย่างโค้ดที่เล็ง enemies', () => {
    render(
      <SkillGainsPanel
        gains={{
          ...empty,
          mastery: [{ skillId: 'w_execute', nameTh: 'ปิดฉาก', casts: 5, correct: 5, credited: 2, total: 30, need: 30, rankedUp: true }],
          newSkills: [{ id: 'w_cleave', nameTh: 'ผ่าพสุธา', kind: 'physical', mpCost: 20, aoe: true, source: 'line' }],
        }}
      />,
    );
    expect(screen.getByText('ปิดฉาก ขึ้นขั้น 2')).toBeTruthy();
    expect(screen.getByText('ได้สกิลใหม่ ผ่าพสุธา')).toBeTruthy();
    expect(screen.getByText('cast("cleave", enemies)')).toBeTruthy();
  });

  it('ใช้ผิดจังหวะบ่อย = รอบนี้ไม่นับ พร้อมเหตุผล · ตำราที่ยังไม่ดรอปบอกระยะถึงเพดานดวง', () => {
    render(
      <SkillGainsPanel
        gains={{
          ...empty,
          mastery: [{ skillId: 'm_firebolt', nameTh: 'ลูกไฟ', casts: 20, correct: 14, credited: 0, total: 6, need: 30, rankedUp: false }],
          books: { dropped: [], progress: [{ id: 'stun', nameTh: 'ตำรามึน', kills: 1, pity: 5, pityMax: 8 }] },
        }}
      />,
    );
    expect(screen.getByText('รอบนี้ไม่นับ')).toBeTruthy();
    expect(screen.getByText(/ใช้ผิดจังหวะบ่อยเกินไป/)).toBeTruthy();
    expect(screen.getByText(/ตำรามึน: ล้มต้นทางได้ 1 ตัวในรอบนี้ · สะสม 5\/8 ครั้ง/)).toBeTruthy();
  });
});
