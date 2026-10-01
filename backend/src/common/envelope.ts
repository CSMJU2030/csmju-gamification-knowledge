/**
 * รูปแบบ response กลาง (api-conventions.md ข้อ 3, 5)
 *
 *   สำเร็จ     { success: true, data }
 *   คอลเลกชัน  { success: true, data: [], meta: { total, page, limit, totalPages } }
 *   ผิดพลาด    { success: false, error: { code, message, details? } }   ← all-exceptions.filter.ts
 *
 * controller คืน "ข้อมูลล้วน" หรือ `Page` แล้ว ResponseEnvelopeInterceptor ห่อให้ทุกตัว
 * จึงไม่มี endpoint ไหนลืมห่อได้
 */
export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class Page<T> {
  constructor(
    readonly items: T[],
    readonly meta: PageMeta,
  ) {}

  static of<T>(items: T[], total: number, page: number, limit: number): Page<T> {
    return new Page(items, { total, page, limit, totalPages: Math.ceil(total / limit) });
  }
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

export function wrap<T>(body: T | Page<T>): SuccessEnvelope<T | T[]> {
  if (body instanceof Page) return { success: true, data: body.items, meta: body.meta };
  return { success: true, data: body };
}
