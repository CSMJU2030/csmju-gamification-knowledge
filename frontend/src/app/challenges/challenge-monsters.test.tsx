/**
 * มอนของโจทย์ (docs/design-challenge-monsters.md) — ฟอร์มของผู้สอน และปุ่มสู้ของผู้เล่น
 *   1. ตรวจก่อนส่งด้วยกติกาเดียวกับ backend · ช่องที่ผิดได้ข้อความใต้ช่อง · ไม่ยิง API
 *   2. ส่ง monsters ไปกับโจทย์ · แก้โจทย์แล้วลบมอนจนหมด = ส่ง []
 *   3. 400 จาก backend ที่ชี้ "monsters.0.programSource" ไปขึ้นใต้ช่องโปรแกรมของมอนตัวนั้น (อ่านง่าย)
 *   4. ปุ่มสู้ → POST /battles { challengeId } → ส่งผลไปเวทีรบ
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const patch = vi.fn();
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...real,
    api: {
      ...real.api,
      post: (...args: unknown[]) => post(...args),
      patch: (...args: unknown[]) => patch(...args),
    },
  };
});
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
const character = { level: 5, displayName: '6704101001' };
vi.mock('@/lib/game/session', () => ({
  useGame: () => ({
    character: { status: 'ready', character },
    gameData: null,
    can: () => true,
    coreUserId: 't-one',
    setCharacter: vi.fn(),
  }),
}));
vi.mock('@/game-stage/sprites/SpritePortrait', () => ({ default: ({ spriteId }: { spriteId: string }) => <span data-sprite={spriteId} /> }));
const setPendingBattle = vi.fn();
vi.mock('@/lib/game/battle-store', () => ({ setPendingBattle: (b: unknown) => setPendingBattle(b) }));

import { ApiError } from '@/lib/api/client';
import type { Challenge } from '@/lib/api/types';
import { ChallengeForm } from './_form';
import { ChallengeFight, monsterErrors, newDraft, splitMonsterDetails } from './_monsters';

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: '11111111-1111-4111-8111-111111111111',
  coreUserId: 't-one',
  title: 'สู้สไลม์',
  description: '',
  starterSource: 'def turn():\n    attack(weakest(enemies))\n',
  regionId: null,
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
  monsters: [
    { position: 1, name: 'สไลม์ขี้ระแวง', archetypeId: 'slime', level: 3, hpMult: 2, dmgMult: 1, skills: ['mon_bite'], programSource: null },
  ],
  ...over,
});

beforeEach(() => {
  post.mockReset();
  patch.mockReset();
  push.mockReset();
  setPendingBattle.mockReset();
});
afterEach(cleanup);

describe('กติกาฝั่งฟอร์ม', () => {
  it('ค่าเริ่มต้นของมอนใหม่ผ่าน · ช่องว่างและค่านอกขอบเขตถูกชี้ด้วย path', () => {
    expect(monsterErrors([newDraft()])).toEqual({});
    const errs = monsterErrors([{ ...newDraft(), level: '', hpMult: '9', name: ' ' }]);
    expect(Object.keys(errs).sort()).toEqual(['monsters.0.hpMult', 'monsters.0.level', 'monsters.0.name']);
  });

  it('แยก details ของมอนออกจากของช่องอื่น', () => {
    expect(splitMonsterDetails(['title: ห้ามว่าง', 'monsters.1.level: เลเวลผิด', 'monsters: เกิน 4 ตัว'])).toEqual({
      monsters: { 'monsters.1.level': 'เลเวลผิด', monsters: 'เกิน 4 ตัว' },
      rest: ['title: ห้ามว่าง'],
    });
  });
});

describe('ฟอร์มโจทย์ของผู้สอน', () => {
  it('เพิ่มมอน → ส่ง monsters ไปกับโจทย์ · เพิ่มได้ไม่เกิน 4 ตัว', async () => {
    post.mockResolvedValueOnce(challenge());
    render(<ChallengeForm />);
    fireEvent.change(screen.getByRole('textbox', { name: /^ชื่อโจทย์/ }), { target: { value: 'สู้สไลม์' } });
    const add = screen.getByRole('button', { name: 'เพิ่มมอน' });
    for (let i = 0; i < 4; i++) fireEvent.click(add);
    expect(add).toHaveProperty('disabled', true);
    expect(screen.getByText('ครบ 4 ตัวแล้ว')).toBeTruthy();
    for (const i of [4, 3, 2]) fireEvent.click(screen.getByRole('button', { name: `ลบมอนตัวที่ ${i}` }));

    fireEvent.change(screen.getByRole('spinbutton', { name: /^เลเวล/ }), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'สร้างโจทย์' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const [path, body] = post.mock.calls[0];
    expect(path).toBe('/challenges');
    expect(body.monsters).toEqual([
      { name: 'สไลม์', archetypeId: 'slime', level: 7, hpMult: 1, dmgMult: 1, skills: ['mon_bite'], programSource: null },
    ]);
    expect(push).toHaveBeenCalledWith('/challenges/11111111-1111-4111-8111-111111111111');
  });

  it('ค่าผิดในเครื่อง → ไม่ส่ง · ข้อความใต้ช่องของมอนตัวนั้น', async () => {
    render(<ChallengeForm />);
    fireEvent.change(screen.getByRole('textbox', { name: /^ชื่อโจทย์/ }), { target: { value: 'สู้สไลม์' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มมอน' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /^เลเวล/ }), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'สร้างโจทย์' }));
    expect(await screen.findByText(/เลเวลต้องเป็นจำนวนเต็ม 1–50/)).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: /^เลเวล/ }).getAttribute('aria-invalid')).toBe('true');
    expect(post).not.toHaveBeenCalled();
  });

  it('เปลี่ยนต้นแบบ → สกิลและชื่อ (ที่ยังไม่ตั้งเอง) ตามต้นแบบใหม่ · ปุ่มเริ่มจากโปรแกรมตามบทบาท', () => {
    render(<ChallengeForm />);
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มมอน' }));
    fireEvent.change(screen.getByRole('combobox', { name: /^ต้นแบบ/ }), { target: { value: 'dark_mage' } });
    expect((screen.getByRole('textbox', { name: /^ชื่อมอน/ }) as HTMLInputElement).value).toBe('เมจมืด');
    expect((screen.getByRole('checkbox', { name: /ศรมืด/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /^กัด/ }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /เริ่มจากโปรแกรมตามบทบาทของเมจมืด/ }));
    const program = screen.getByRole('textbox', { name: /^โปรแกรมของมอน/ }) as HTMLTextAreaElement;
    expect(program.value).toMatch(/cast\("dark_bolt"/);
  });

  it('แก้โจทย์แล้วลบมอนจนหมด → ส่ง monsters: [] · 400 ของโปรแกรมมอนขึ้นใต้ช่องนั้นแบบอ่านง่าย', async () => {
    const c = challenge();
    patch.mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_ERROR', 'ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ', [
        'monsters.0.programSource: 2:5:NameError:ไม่รู้จัก foo',
      ]),
    );
    const { unmount } = render(<ChallengeForm initial={c} />);
    // ผ่านการตรวจในเครื่อง แต่ backend ตอบ 400 (เช่น กติกาเปลี่ยนก่อนหน้าเว็บจะอัปเดต) — ต้องขึ้นใต้ช่องเดียวกัน
    fireEvent.change(screen.getByRole('textbox', { name: /^โปรแกรมของมอน/ }), { target: { value: 'def turn():\n    defend()\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }));
    expect(await screen.findByText('บรรทัด 2 คอลัมน์ 5: ไม่รู้จัก foo')).toBeTruthy();
    unmount();

    patch.mockResolvedValueOnce({ ...c, monsters: [] });
    render(<ChallengeForm initial={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบมอนตัวที่ 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1][1].monsters).toEqual([]);
  });
});

describe('ปุ่มสู้ของผู้เล่น', () => {
  it('บอกรางวัลชนะครั้งแรกตามเลเวล · กดแล้ว POST /battles { challengeId } และส่งผลไปเวทีรบ', async () => {
    const c = challenge({ myResult: { attempts: 0, cleared: false, firstClearedAt: null } });
    const outcome = { id: 'a1', result: { victory: true } };
    post.mockResolvedValueOnce(outcome);
    render(<ChallengeFight challenge={c} />);
    // เลเวล 5: EXP = round(20 × 5^1.8 × 0.1) = 36 · ทอง = 15 + 9 × 5 = 60
    expect(screen.getByText(/ชนะครั้งแรกได้ \+36 EXP และ \+60 ทอง/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'สู้กับมอนของโจทย์' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/battle'));
    expect(post).toHaveBeenCalledWith('/battles', { challengeId: c.id });
    expect(setPendingBattle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'challenge', challengeId: c.id, title: 'สู้สไลม์', enemyLevel: 3, outcome }),
    );
  });

  it('ชนะแล้ว → บอกผลของตัวเอง ไม่บอกรางวัลซ้ำ · 409 → ข้อความจาก backend', async () => {
    const c = challenge({ myResult: { attempts: 3, cleared: true, firstClearedAt: '2026-10-07T03:00:00.000Z' } });
    post.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'โจทย์นี้ยังไม่มีมอนให้สู้'));
    render(<ChallengeFight challenge={c} />);
    const status = screen.getByText('ชนะแล้ว');
    expect(within(status.parentElement!).getByText(/สู้ไปแล้ว 3 ครั้ง/)).toBeTruthy();
    expect(screen.queryByText(/ชนะครั้งแรกได้/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'สู้กับมอนของโจทย์' }));
    expect(await screen.findByText('โจทย์นี้ยังไม่มีมอนให้สู้')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
