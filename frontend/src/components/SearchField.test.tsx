/**
 * ช่องค้นหาของตาราง — หน่วงก่อนค้น · Enter ค้นทันที · Esc/× ล้าง · ค่าที่เท่ากันไม่ยิงซ้ำ · ล้างจากข้างนอกแล้วช่องว่างตาม
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_DEBOUNCE_MS, SearchField, normalizeQuery } from './SearchField';

function Harness({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState('');
  return (
    <>
      <SearchField
        label="ค้นหาไอเทม"
        placeholder="ชื่อไอเทม"
        value={q}
        onSearch={(next) => {
          onSearch(next);
          setQ(next);
        }}
        status={q ? `ค้นหา ${q}` : ''}
      />
      <button type="button" onClick={() => setQ('')}>
        ล้างจากข้างนอก
      </button>
    </>
  );
}

const input = () => screen.getByRole('searchbox', { name: 'ค้นหาไอเทม' }) as HTMLInputElement;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SearchField', () => {
  it('normalizeQuery ตัดหัวท้ายและยุบช่องว่าง (รูปเดียวกับ backend)', () => {
    expect(normalizeQuery('  ดาบ   เหล็ก ')).toBe('ดาบ เหล็ก');
    expect(normalizeQuery('   ')).toBe('');
  });

  it('พิมพ์ต่อเนื่องค้นครั้งเดียวหลังหยุดพิมพ์ · ช่องว่างที่เพิ่มท้ายไม่ยิงซ้ำ', () => {
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);
    fireEvent.change(input(), { target: { value: 'ด' } });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.change(input(), { target: { value: 'ดาบ' } });
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenLastCalledWith('ดาบ');
    expect(screen.getByText('ค้นหา ดาบ')).toBeTruthy();

    fireEvent.change(input(), { target: { value: 'ดาบ  ' } });
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('Enter ค้นทันที · Esc ล้างและค้นใหม่ด้วยค่าว่าง', () => {
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);
    fireEvent.change(input(), { target: { value: ' แหวน ' } });
    fireEvent.submit(input().form!);
    expect(onSearch).toHaveBeenLastCalledWith('แหวน');
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().value).toBe('');
    expect(onSearch).toHaveBeenLastCalledWith('');
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it('ปุ่ม × มีชื่อให้โปรแกรมอ่านจอ · ล้างจากข้างนอก (เช่น ปุ่มในสถานะค้นไม่พบ) แล้วช่องว่างตาม', () => {
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);
    expect(screen.queryByRole('button', { name: 'ล้างการค้นหา' })).toBeNull();
    fireEvent.change(input(), { target: { value: 'สร้อย' } });
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(screen.getByRole('button', { name: 'ล้างการค้นหา' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ล้างจากข้างนอก' }));
    expect(input().value).toBe('');
    expect(screen.getByRole('search')).toBeTruthy();
  });
});
