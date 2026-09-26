/**
 * ปุ่มออกจากระบบ (sso.ts signOut) — ลำดับคำขอ และกันไม่ให้ 401 ที่ค้างอยู่พากลับเข้า SSO
 * ผลกับ Core Hub ตัวจริงตรวจด้วยเบราว์เซอร์จริงใน csmju2030/web-test.mjs (W4)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sso = typeof import('./sso');

let assign: ReturnType<typeof vi.fn>;
let calls: string[];

async function loadSso(fetchImpl?: (url: string, init?: RequestInit) => Promise<unknown>): Promise<Sso> {
  vi.resetModules();
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}${init?.mode ? ` ${init.mode}` : ''}${init?.credentials ? ` ${init.credentials}` : ''}`);
      return fetchImpl ? fetchImpl(url, init) : Promise.resolve(new Response(null, { status: 200 }));
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
  vi.useRealTimers();
});

describe('signOut', () => {
  it('ลบ session ของระบบนี้ → ไปหน้าแรกของ Core Hub · ไม่เรียกอะไรของ Core Hub', async () => {
    const sso = await loadSso();
    window.sessionStorage.setItem('csmju:return-to', '/items');
    await sso.signOut();
    expect(calls).toEqual(['DELETE /api/v1/sessions/current same-origin']);
    expect(assign).toHaveBeenCalledWith('http://localhost:3100/');
    expect(window.sessionStorage.getItem('csmju:return-to')).toBeNull();
  });

  it('ระหว่างออก 401 ที่ค้างอยู่ห้ามพาไป SSO · กดซ้ำไม่ยิงซ้ำ', async () => {
    let release!: () => void;
    const sso = await loadSso(() => new Promise((resolve) => (release = () => resolve(new Response(null)))));
    const first = sso.signOut();
    sso.redirectToSsoLogin();
    await sso.signOut();
    expect(assign).not.toHaveBeenCalled();
    release();
    await first;
    expect(calls.filter((c) => c.startsWith('DELETE'))).toHaveLength(1);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('http://localhost:3100/');
  });

  it('คำขอพังหรือค้างก็ยังไปหน้าแรกของ Core Hub (รอไม่เกิน 5 วินาที)', async () => {
    const offline = await loadSso(() => Promise.reject(new TypeError('offline')));
    await offline.signOut();
    expect(assign).toHaveBeenCalledWith('http://localhost:3100/');

    assign.mockClear();
    vi.useFakeTimers();
    const hanging = await loadSso(() => new Promise(() => {}));
    const done = hanging.signOut();
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(assign).toHaveBeenCalledWith('http://localhost:3100/');
  });

  it('ปลายทางหลังออกตั้งได้ด้วย NEXT_PUBLIC_SSO_LOGOUT_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SSO_LOGOUT_URL', 'https://core.example/');
    const sso = await loadSso();
    await sso.signOut();
    expect(assign).toHaveBeenCalledWith('https://core.example/');
  });
});

describe('ssoLoginUrl', () => {
  it('ค่าเริ่มต้นคือ /api/sso ของหน้าเว็บ Core Hub ที่ localhost', async () => {
    const sso = await loadSso();
    expect(sso.ssoLoginUrl()).toBe('http://localhost:3100/api/sso/csmju-gamification-knowledge');
  });
});
