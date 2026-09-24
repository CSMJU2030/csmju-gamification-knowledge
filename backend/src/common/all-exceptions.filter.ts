/**
 * ตัวแปลงข้อผิดพลาดทุกชนิดเป็น error envelope มาตรฐาน
 *
 * สิ่งที่ห้ามหลุดออกไปใน response (api-conventions.md ข้อ 4): stack trace · ชื่อไฟล์ ·
 * ข้อความจาก ORM หรือ SQL — ข้อผิดพลาดที่ไม่รู้จักทุกตัวจึงกลายเป็น INTERNAL_ERROR
 * พร้อมข้อความกลาง ๆ ส่วนรายละเอียดจริงไปอยู่ใน log ฝั่งเซิร์ฟเวอร์เท่านั้น
 */
import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError, ErrorCode } from './api-error';

interface ErrorBody {
  success: false;
  error: { code: ErrorCode; message: string; details?: string[] };
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

const MESSAGE_BY_CODE: Record<ErrorCode, string> = {
  BAD_REQUEST: 'คำขอไม่ถูกต้อง',
  VALIDATION_ERROR: 'ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ',
  UNAUTHORIZED: 'ต้องเข้าสู่ระบบผ่าน Core Hub ก่อน',
  FORBIDDEN: 'สิทธิ์ไม่พอสำหรับการกระทำนี้',
  NOT_FOUND: 'ไม่พบสิ่งที่ร้องขอ',
  CONFLICT: 'สถานะปัจจุบันไม่อนุญาตให้ทำสิ่งนี้',
  INTERNAL_ERROR: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
};

/** ข้อผิดพลาดจาก body-parser (JSON พัง · payload ใหญ่เกิน) มี status ติดมาแต่ไม่ใช่ HttpException */
function parserStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const e = exception as { status?: unknown; statusCode?: unknown; type?: unknown };
  const status = typeof e.status === 'number' ? e.status : e.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500 && typeof e.type === 'string') {
    return status;
  }
  return null;
}

export function toErrorBody(exception: unknown): { status: number; body: ErrorBody } {
  if (exception instanceof ApiError) {
    const error: ErrorBody['error'] = { code: exception.errorCode, message: exception.message };
    if (exception.details && exception.details.length > 0) error.details = exception.details;
    return { status: exception.getStatus(), body: { success: false, error } };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code: ErrorCode = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    // ข้อความของ Nest เอง (เช่น "Cannot GET /api/v1/x") บอกโครงสร้างภายในเกินจำเป็น — ใช้ข้อความกลางแทน
    const message = status === HttpStatus.NOT_FOUND ? 'ไม่พบ endpoint นี้' : MESSAGE_BY_CODE[code];
    return { status, body: { success: false, error: { code, message } } };
  }

  const parsed = parserStatus(exception);
  if (parsed !== null) {
    return {
      status: parsed,
      body: { success: false, error: { code: 'BAD_REQUEST', message: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' } },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: MESSAGE_BY_CODE.INTERNAL_ERROR } },
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = toErrorBody(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    }
    if (response.headersSent) return;
    response.status(status).json(body);
  }
}
