/**
 * ข้อผิดพลาดของ API — `error.code` มีได้เฉพาะ 9 ค่าในรายการปิดของมาตรฐาน
 * (standards/contracts/error-codes.json) ห้ามคิดค่าใหม่เอง
 */
import { HttpException } from '@nestjs/common';

export const ERROR_HTTP_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;

export class ApiError extends HttpException {
  /** วินาทีที่ให้ client รอก่อนลองใหม่ — filter ใส่เป็น header `Retry-After` (api-conventions ข้อ 4 · reference-data ข้อ 7.4) */
  retryAfterSec?: number;

  constructor(
    readonly errorCode: ErrorCode,
    message: string,
    readonly details?: string[],
    status: number = ERROR_HTTP_STATUS[errorCode],
  ) {
    super(message, status);
  }
}

export const badRequest = (message: string, details?: string[]) =>
  new ApiError('BAD_REQUEST', message, details);
export const validationError = (details: string[], message = 'ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ') =>
  new ApiError('VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'ต้องเข้าสู่ระบบผ่าน Core Hub ก่อน') =>
  new ApiError('UNAUTHORIZED', message);
export const forbidden = (message = 'สิทธิ์ไม่พอสำหรับการกระทำนี้') =>
  new ApiError('FORBIDDEN', message);
export const notFound = (message: string) => new ApiError('NOT_FOUND', message);
/** ระบบที่เราพึ่ง (เช่น Core Hub) ล่มหรือจำกัดอัตรา — 503 พร้อม Retry-After */
export function serviceUnavailable(message: string, retryAfterSec: number): ApiError {
  const error = new ApiError('SERVICE_UNAVAILABLE', message);
  error.retryAfterSec = retryAfterSec;
  return error;
}
export const conflict = (message: string) => new ApiError('CONFLICT', message);
