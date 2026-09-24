/**
 * ข้อผิดพลาดของ API — `error.code` มีได้เฉพาะ 7 ค่าในรายการปิดของมาตรฐาน
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
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;

export class ApiError extends HttpException {
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
export const conflict = (message: string) => new ApiError('CONFLICT', message);
