/**
 * silent re-SSO และทางเข้า/ออกตามสัญญา auth 1.1 (auth-contract ข้อ 5 · 7) — csmju/sso.ts
 * flow จริงกับเบราว์เซอร์ตรวจใน csmju2030/web-test.mjs · ฝั่ง backend ตรวจใน e2e และ conformance L3-16..22
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sso = typeof import('./sso') & typeof import('./useUnsavedWork');

let assign: ReturnType<typeof vi.fn>;

async function loadSso(): Promise<Sso> {
  vi.resetModules();
  // โหลดคู่กันหลัง reset — hook ต้องใช้ตัวนับของโมดูล sso ชุดเดียวกัน
  const [sso, hook] = await Promise.all([import('./sso'), import('./useUnsavedWork')]);
  return { ...sso, ...hook };
}

beforeEach(() => {
  assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign, pathname: '/items', search: '?q=ดาบ' },
  });
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('เข้าสู่ระบบเริ่มที่ /auth/login ของเราเอง', () => {
  it('loginUrl ใส่ next แบบเข้ารหัส', async () => {
    const sso = await loadSso();
    expect(sso.loginUrl()).toBe('/auth/login');
    expect(sso.loginUrl('/items?q=ดาบ')).toBe('/auth/login?next=%2Fitems%3Fq%3D%E0%B8%94%E0%B8%B2%E0%B8%9A');
  });

  it('401 → พาทั้งหน้าไป /auth/login?next=<หน้าปัจจุบัน> ครั้งเดียว แม้ 401 มาพร้อมกันหลายคำขอ', async () => {
    const sso = await loadSso();
    sso.handleUnauthorized();
    sso.handleUnauthorized();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(sso.loginUrl('/items?q=ดาบ'));
  });
});

describe('กันวน 30 วินาที', () => {
  it('เพิ่งเริ่ม re-SSO ไม่ถึง 30 วินาทีแล้วยัง 401 → แสดงปุ่มแทนการพาไปซ้ำ · เกิน 30 วินาทีพาไปได้อีก', async () => {
    vi.useFakeTimers();
    window.sessionStorage.setItem('csmju:sso-started-at', String(Date.now() - 5_000));
    const sso = await loadSso();
    const seen: unknown[] = [];
    sso.subscribeSessionNotice((n) => seen.push(n));
    sso.handleUnauthorized();
    expect(assign).not.toHaveBeenCalled();
    expect(seen.at(-1)).toEqual({ kind: 'loop', loginHref: sso.loginUrl('/items?q=ดาบ') });

    vi.advanceTimersByTime(sso.LOOP_GUARD_MS);
    sso.handleUnauthorized();
    expect(assign).toHaveBeenCalledTimes(1);
  });
});

describe('หน้าที่มีงานค้าง ห้าม redirect ทับ', () => {
  it('ระหว่างมีงานยังไม่บันทึก 401 → แสดงปุ่มให้เลือกเอง · บันทึกแล้ว (dirty = false) 401 พาไปตามปกติ', async () => {
    const sso = await loadSso();
    const seen: unknown[] = [];
    sso.subscribeSessionNotice((n) => seen.push(n));
    const { rerender } = renderHook(({ dirty }) => sso.useUnsavedWork(dirty), { initialProps: { dirty: true } });
    sso.handleUnauthorized();
    expect(assign).not.toHaveBeenCalled();
    expect(seen.at(-1)).toEqual({ kind: 'unsaved', loginHref: sso.loginUrl('/items?q=ดาบ') });

    rerender({ dirty: false });
    sso.handleUnauthorized();
    expect(assign).toHaveBeenCalledWith(sso.loginUrl('/items?q=ดาบ'));
  });
});

describe('ต่ออายุล่วงหน้าตอนเปลี่ยนหน้า (session.expiresAt)', () => {
  const now = Date.parse('2026-09-29T10:00:00Z');

  it('เหลือไม่ถึง 2 นาที → ไป /auth/login?next=<หน้าใหม่> · ยังเหลือนาน → ไม่ทำอะไร', async () => {
    const sso = await loadSso();
    expect(sso.renewIfExpiring('2026-09-29T10:10:00Z', '/world', now)).toBe(false);
    expect(sso.renewIfExpiring(undefined, '/world', now)).toBe(false);
    expect(sso.renewIfExpiring('not-a-date', '/world', now)).toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(sso.renewIfExpiring('2026-09-29T10:01:00Z', '/world', now)).toBe(true);
    expect(assign).toHaveBeenCalledWith('/auth/login?next=%2Fworld');
  });

  it('มีงานค้าง หรือเพิ่งกลับจาก re-SSO → ไม่ต่ออายุเอง', async () => {
    const sso = await loadSso();
    const { unmount } = renderHook(() => sso.useUnsavedWork(true));
    expect(sso.renewIfExpiring('2026-09-29T10:00:30Z', '/world', now)).toBe(false);
    unmount();
    window.sessionStorage.setItem('csmju:sso-started-at', String(now - 10_000));
    expect(sso.renewIfExpiring('2026-09-29T10:00:30Z', '/world', now)).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('ออกจากระบบ', () => {
  it('ฟอร์ม POST /auth/logout กำลังส่ง → 401 ที่ค้างอยู่ห้ามพาไป login ทับ', async () => {
    const sso = await loadSso();
    expect(sso.LOGOUT_PATH).toBe('/auth/logout');
    sso.markSigningOut();
    sso.handleUnauthorized();
    expect(assign).not.toHaveBeenCalled();
  });

  it('ปุ่ม "กลับหน้าหลัก CSMJU" ไม่ตั้ง = Core Hub จริง · ตั้งได้ด้วย NEXT_PUBLIC_CORE_DASHBOARD_URL', async () => {
    let sso = await loadSso();
    expect(sso.coreDashboardUrl()).toBe('https://csmju2030.jowave.com/');
    vi.stubEnv('NEXT_PUBLIC_CORE_DASHBOARD_URL', 'http://localhost:3100/');
    sso = await loadSso();
    expect(sso.coreDashboardUrl()).toBe('http://localhost:3100/');
    vi.stubEnv('NEXT_PUBLIC_CORE_DASHBOARD_URL', 'https://core.example/');
    sso = await loadSso();
    expect(sso.coreDashboardUrl()).toBe('https://core.example/');
  });
});
