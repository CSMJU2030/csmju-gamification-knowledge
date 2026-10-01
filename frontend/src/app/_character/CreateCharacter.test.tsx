/**
 * สร้างตัวละคร — ชื่อในเกมคือรหัสจาก Core Hub · บัญชีที่ไม่มีรหัสจึงค่อยตั้งชื่อเอง (มีอักษรไทย)
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...real, api: { ...real.api, post: (...args: unknown[]) => post(...args) } };
});

import { ApiError } from '@/lib/api/client';
import { CreateCharacter } from './CreateCharacter';

const noCode = new ApiError(400, 'VALIDATION_ERROR', 'บัญชีนี้ไม่มีรหัสใน Core Hub — ต้องตั้งชื่อในเกมเอง', [
  'displayName: บัญชีนี้ไม่มีรหัสนักศึกษา/บุคลากรใน Core Hub — ตั้งชื่อในเกมเอง (3-20 ตัว มีอักษรไทยอย่างน้อย 1 ตัว)',
]);

beforeEach(() => post.mockReset());
afterEach(cleanup);

describe('CreateCharacter', () => {
  it('มีรหัสใน Core Hub: กดเริ่มเล่นครั้งเดียว ส่ง body ว่าง ได้ตัวละครชื่อรหัส ไม่มีช่องให้พิมพ์', async () => {
    const created = { displayName: '6504101234' };
    post.mockResolvedValueOnce(created);
    const onCreated = vi.fn();
    render(<CreateCharacter onCreated={onCreated} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/ชื่อในเกมของคุณคือรหัสนักศึกษา/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(post).toHaveBeenCalledWith('/characters', {});
  });

  it('ไม่มีรหัส: ได้ 400 ที่ displayName → แสดงช่องตั้งชื่อ · ชื่อไม่มีอักษรไทยถูกเตือนโดยไม่ส่ง · ชื่อไทยส่งเป็น displayName', async () => {
    post.mockRejectedValueOnce(noCode);
    const onCreated = vi.fn();
    render(<CreateCharacter onCreated={onCreated} />);
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น' }));
    const input = await screen.findByRole('textbox', { name: /^ชื่อตัวละคร/ });
    expect(screen.getByRole('heading', { name: 'ตั้งชื่อตัวละคร' })).toBeTruthy();

    fireEvent.change(input, { target: { value: '6504101234' } });
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น' }));
    expect(await screen.findByText(/มีอักษรไทยอย่างน้อย 1 ตัว ใช้ได้เฉพาะ/)).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);

    post.mockResolvedValueOnce({ displayName: 'นักสู้_01' });
    fireEvent.change(input, { target: { value: 'นักสู้_01' } });
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(post).toHaveBeenLastCalledWith('/characters', { displayName: 'นักสู้_01' });
  });

  it('Core Hub ล่ม (503) → แสดงข้อความให้ลองใหม่ ไม่เปิดช่องตั้งชื่อ', async () => {
    post.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'ติดต่อ Core Hub ไม่ได้ชั่วคราว — รอสักครู่แล้วลองใหม่'));
    render(<CreateCharacter onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น' }));
    expect(await screen.findByText(/ติดต่อ Core Hub ไม่ได้ชั่วคราว/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
