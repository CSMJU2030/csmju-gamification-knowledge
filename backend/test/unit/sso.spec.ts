/**
 * ตัวช่วยของ Central SSO 1.1 (auth-contract.md ข้อ 5.2) — กฎของ next 5 ข้อ · state · ชื่อและ attribute ของคุกกี้
 * flow เต็ม (login → callback → logout) ตรวจใน e2e และ conformance L3-16..22
 */
import {
  DEFAULT_NEXT,
  SESSION_COOKIE,
  STATE_COOKIE,
  STATE_TTL_MS,
  newState,
  parseStateCookie,
  safeNext,
  sameState,
  sessionCookieOptions,
  stateCookieOptions,
  stateCookieValue,
} from '../../src/auth/sso';

describe('ชื่อคุกกี้ขึ้นต้นด้วยชื่อระบบ (- เป็น _)', () => {
  it('session และ state', () => {
    expect(SESSION_COOKIE).toBe('csmju_gamification_knowledge_access_token');
    expect(STATE_COOKIE).toBe('csmju_gamification_knowledge_sso_state');
  });
  it('attribute ตามสัญญา: HttpOnly · Lax · session Path=/ · state Path=/auth/callback ≤ 600 วินาที · Secure เฉพาะ production', () => {
    expect(sessionCookieOptions(false, 1000)).toEqual({ httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 1000 });
    expect(stateCookieOptions(true)).toEqual({ httpOnly: true, sameSite: 'lax', secure: true, path: '/auth/callback', maxAge: STATE_TTL_MS });
    expect(STATE_TTL_MS).toBeLessThanOrEqual(600_000);
  });
});

describe('กฎของ next (ข้อ 5.2)', () => {
  it.each([
    ['/items', '/items'],
    ['/items?q=%E0%B8%94%E0%B8%B2%E0%B8%9A&page=2', '/items?q=%E0%B8%94%E0%B8%B2%E0%B8%9A&page=2'],
    ['/world/region#zone', '/world/region#zone'],
    ['/a/../items', '/items'],
  ])('ใช้ได้: %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    ['ไม่ใช่ string', 42],
    ['ว่าง', ''],
    ['ยาวเกิน 512', `/${'a'.repeat(512)}`],
    ['ไม่ขึ้นต้นด้วย /', 'items'],
    ['URL เต็ม', 'https://evil.example.com/'],
    ['// (protocol-relative)', '//evil.example.com'],
    ['มี \\ (เบราว์เซอร์มอง /\\host เป็น //host)', '/\\evil.example.com'],
    ['อักขระควบคุม CR/LF', '/items\r\nSet-Cookie:x=1'],
    ['อักขระควบคุม tab', '/items\t'],
    ['DEL', '/items\u007f'],
    ['/auth', '/auth'],
    ['ใต้ /auth/', '/auth/login?next=/x'],
    ['/auth ตัวพิมพ์ใหญ่', '/AUTH/logout'],
    ['/auth แบบเข้ารหัส %', '/%61uth/callback'],
    ['จุดพาเข้า /auth', '/x/../auth/login'],
    ['% ที่ถอดไม่ได้', '/%E0%A4%A'],
  ])('ไม่ผ่าน → หน้าแรก: %s', (_label, input) => {
    expect(safeNext(input)).toBe(DEFAULT_NEXT);
  });
});

describe('state', () => {
  it('สุ่ม 32 ไบต์ base64url · ไม่ซ้ำ', () => {
    const a = newState();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(newState()).not.toBe(a);
  });
  it('คุกกี้ state เก็บ next ภาษาไทยไป-กลับได้ครบ', () => {
    const state = newState();
    const next = '/items?q=ดาบเหล็ก';
    expect(parseStateCookie(stateCookieValue(state, next))).toEqual({ state, next });
  });
  it.each([null, '', 'no-dot', '.abc', 'short.L2l0ZW1z', `${'a'.repeat(43)}!.L2l0ZW1z`])('คุกกี้รูปแบบผิด %p → ไม่มี', (raw) => {
    expect(parseStateCookie(raw)).toBeNull();
  });
  it('เทียบ state: ตรงเป๊ะเท่านั้น · ยาวต่างกันไม่พัง', () => {
    const state = newState();
    expect(sameState(state, state)).toBe(true);
    expect(sameState(state, newState())).toBe(false);
    expect(sameState(state, `${state}x`)).toBe(false);
    expect(sameState('', state)).toBe(false);
  });
});
