/**
 * ปุ่มออกจากระบบ (sso.ts signOut) — แค่พาไปหน้าแรกของ Core Hub ไม่เรียก API ใด ๆ (auth-contract ข้อ 9)
 * และกันไม่ให้ 401 ที่ค้างอยู่พากลับเข้า SSO · ผลกับเบราว์เซอร์จริงตรวจใน csmju2030/web-test.mjs (W4)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sso = typeof import('./sso');

let assign: ReturnType<typeof vi.fn>;
let calls: string[];

async function loadSso(): Promise<Sso> {
  vi.resetModules();
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return Promise.resolve(new Response(null, { status: 200 }));
    }),
  );
  return import('./sso');
}

beforeEach(() => {
  assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign, pathname: '/items', search: '' },
  });
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('signOut', () => {
  it('ไปหน้าแรกของ Core Hub อย่างเดียว · ไม่เรียก API ใด ๆ · ล้างหน้าที่จำไว้', async () => {
    const sso = await loadSso();
    window.sessionStorage.setItem('csmju:return-to', '/items');
    sso.signOut();
    expect(calls).toEqual([]);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('http://localhost:3100/');
    expect(window.sessionStorage.getItem('csmju:return-to')).toBeNull();
  });

  it('หลังกดออก 401 ที่ค้างอยู่ห้ามพาไป SSO · กดซ้ำไม่ไปซ้ำ', async () => {
    const sso = await loadSso();
    sso.signOut();
    sso.redirectToSsoLogin();
    sso.signOut();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('http://localhost:3100/');
    expect(window.sessionStorage.getItem('csmju:return-to')).toBeNull();
  });

  it('ปลายทางหลังออกตั้งได้ด้วย NEXT_PUBLIC_SSO_LOGOUT_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SSO_LOGOUT_URL', 'https://core.example/');
    const sso = await loadSso();
    sso.signOut();
    expect(assign).toHaveBeenCalledWith('https://core.example/');
  });
});

describe('ssoLoginUrl', () => {
  it('ค่าเริ่มต้นคือ /api/sso ของหน้าเว็บ Core Hub ที่ localhost', async () => {
    const sso = await loadSso();
    expect(sso.ssoLoginUrl()).toBe('http://localhost:3100/api/sso/csmju-gamification-knowledge');
  });
});
