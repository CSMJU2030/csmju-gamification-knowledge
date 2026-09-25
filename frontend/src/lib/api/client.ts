/**
 * ตัวเรียก API ของ Code Tower — ห่อ envelope `{ success, data/error, meta }` ตาม api-conventions ข้อ 3–4
 *
 * - เรียกผ่าน origin เดียวกับหน้าเว็บ (`/api/v1/...`) — Next ส่งต่อไป backend (next.config.ts)
 *   คุกกี้ HttpOnly `core_hub_access_token` จึงไปกับคำขอเอง ไม่มี token ในโค้ดฝั่งเบราว์เซอร์เลย (SEC-03)
 * - 401 → พากลับ SSO ของ Core Hub ทันที (ui-design-system ข้อ 9.3) แล้วโยน ApiError ให้หน้าหยุดทำงาน
 * - error อื่นโยน ApiError ที่มี `code` มาตรฐาน 7 ค่า + `details` ให้หน้าตัดสินใจแสดงผลตามตาราง G0 ข้อ 6
 */
import { redirectToSsoLogin } from '@/csmju';
import type { ErrorCode, PageMeta } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly details: string[];

  constructor(status: number, code: ApiError['code'], message: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: PageMeta;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /** ปิดแท็บแล้วคำขอยังต้องวิ่งต่อ (ออกจากโซนตอนปิดหน้า) */
  keepalive?: boolean;
}

const KNOWN_CODES: readonly string[] = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
];

const FALLBACK_MESSAGE: Record<string, string> = {
  NETWORK_ERROR: 'เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง',
  FORBIDDEN: 'คุณไม่มีสิทธิ์ใช้งานส่วนนี้ หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ',
  NOT_FOUND: 'ไม่พบข้อมูลที่คุณกำลังค้นหา อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง',
  INTERNAL_ERROR: 'ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง',
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const url = new URL(`/api/v1${path}`, 'http://placeholder');
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url.pathname + url.search, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      keepalive: options.keepalive,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', FALLBACK_MESSAGE.NETWORK_ERROR);
  }

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T; meta?: PageMeta }
    | { success: false; error: { code: string; message: string; details?: string[] } }
    | null;

  if (res.status === 401) {
    redirectToSsoLogin();
    throw new ApiError(401, 'UNAUTHORIZED', 'เซสชันหมดอายุ กำลังพาไปเข้าสู่ระบบใหม่');
  }

  if (res.ok && body && body.success) {
    return { data: body.data, meta: body.meta };
  }

  const err = body && !body.success ? body.error : null;
  const code = (err && KNOWN_CODES.includes(err.code) ? err.code : res.status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST') as ErrorCode;
  const message = err?.message || FALLBACK_MESSAGE[code] || `เกิดข้อผิดพลาด (${res.status})`;
  throw new ApiError(res.status, code, message, err?.details ?? []);
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    apiRequest<T>(path, { query, signal }).then((r) => r.data),
  page: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) => apiRequest<T[]>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body: body ?? {} }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body }).then((r) => r.data),
  delete: <T>(path: string, opts: { keepalive?: boolean } = {}) =>
    apiRequest<T>(path, { method: 'DELETE', keepalive: opts.keepalive }).then((r) => r.data),
};

/** ข้อความที่แสดงให้ผู้ใช้เห็นได้เสมอ (ไม่โชว์ error ดิบของ JS) */
export function userMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return FALLBACK_MESSAGE.INTERNAL_ERROR;
}
