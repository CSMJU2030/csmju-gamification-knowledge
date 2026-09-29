/**
 * ค่าคงที่และตัวช่วยของ Central SSO ตามสัญญา 1.1 (auth-contract.md ข้อ 5 · contracts/jwt-contract.json ก้อน `sso`)
 *
 * - ชื่อคุกกี้ขึ้นต้นด้วยชื่อระบบ (เปลี่ยน `-` เป็น `_`) เพราะตอนพัฒนาทุกระบบรันบน localhost และคุกกี้ไม่แยกตาม port
 * - state สุ่ม 32 ไบต์ base64url เก็บคู่กับ next ในคุกกี้ `<ชื่อ>_sso_state` ที่ Path=/auth/callback อายุ 600 วินาที
 * - next ต้องผ่านกฎ 5 ข้อของข้อ 5.2 ทั้งตอน /auth/login และตอนใช้ใน callback (ค่ากลับมาจากคุกกี้)
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import { SUBSYSTEM_NAME } from '../config/env.validation';

const COOKIE_PREFIX = SUBSYSTEM_NAME.replace(/-/g, '_');

/** `csmju_gamification_knowledge_access_token` — Core Hub token ที่ verify แล้ว (ไม่มี session ของตัวเอง) */
export const SESSION_COOKIE = `${COOKIE_PREFIX}_access_token`;
/** `csmju_gamification_knowledge_sso_state` — state + next ของการ sign-in ที่ค้างอยู่ */
export const STATE_COOKIE = `${COOKIE_PREFIX}_sso_state`;

export const LOGIN_PATH = '/auth/login';
export const CALLBACK_PATH = '/auth/callback';
export const LOGOUT_PATH = '/auth/logout';
export const CORE_HUB_AUTHORIZE_PATH = '/sso/authorize';
export const CORE_HUB_LOGOUT_PATH = '/logout';

/** สัญญากำหนดไม่เกิน 600 วินาที */
export const STATE_TTL_MS = 600_000;
/** หน้าที่พาไปเมื่อ next ใช้ไม่ได้ */
export const DEFAULT_NEXT = '/';
const NEXT_MAX_LENGTH = 512;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43,512}$/;

/** origin สมมติไว้ให้ URL แปลง path — ถ้าผลออกนอก origin นี้ แปลว่า next พาออกนอกระบบ */
const SELF = 'http://subsystem.invalid';

const b64url = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');

/**
 * กฎของ next (ข้อ 5.2) — ผ่านครบทุกข้อจึงใช้ ไม่งั้นใช้หน้า default
 * 1. string ยาว 1–512 · 2. ขึ้นต้น `/` แต่ไม่ใช่ `//` และไม่มี `\` · 3. ไม่มีอักขระควบคุม
 * 4. แปลงกับ origin ของตัวเองแล้วยังอยู่ใน origin เดิม · 5. ไม่ใช่ `/auth` หรือใต้ `/auth/`
 */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > NEXT_MAX_LENGTH) return DEFAULT_NEXT;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return DEFAULT_NEXT;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_NEXT;
  let url: URL;
  try {
    url = new URL(value, SELF);
  } catch {
    return DEFAULT_NEXT;
  }
  if (url.origin !== SELF) return DEFAULT_NEXT;
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    return DEFAULT_NEXT;
  }
  path = path.toLowerCase();
  if (path === '/auth' || path.startsWith('/auth/')) return DEFAULT_NEXT;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** state ใหม่ 32 ไบต์ base64url (43 ตัวอักษร) */
export const newState = (): string => randomBytes(32).toString('base64url');

/** ค่าคุกกี้ state: `<state>.<next แบบ base64url>` */
export const stateCookieValue = (state: string, next: string): string => `${state}.${b64url(next)}`;

/** อ่านคุกกี้ state กลับ — รูปแบบผิดถือว่าไม่มี */
export function parseStateCookie(raw: string | null): { state: string; next: string } | null {
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const state = raw.slice(0, dot);
  if (!STATE_PATTERN.test(state)) return null;
  let next: string;
  try {
    next = Buffer.from(raw.slice(dot + 1), 'base64url').toString('utf8');
  } catch {
    return null;
  }
  return { state, next };
}

/** state จาก query เทียบกับคุกกี้แบบ constant-time */
export function sameState(fromQuery: string, fromCookie: string): boolean {
  const a = Buffer.from(fromQuery, 'utf8');
  const b = Buffer.from(fromCookie, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const base = (production: boolean): CookieOptions => ({ httpOnly: true, sameSite: 'lax', secure: production });

export const sessionCookieOptions = (production: boolean, maxAgeMs: number): CookieOptions => ({
  ...base(production),
  path: '/',
  maxAge: maxAgeMs,
});

export const stateCookieOptions = (production: boolean, maxAgeMs = STATE_TTL_MS): CookieOptions => ({
  ...base(production),
  path: CALLBACK_PATH,
  maxAge: maxAgeMs,
});
