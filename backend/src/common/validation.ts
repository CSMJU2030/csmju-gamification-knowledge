/**
 * ValidationPipe กลาง — body/query ที่ไม่ผ่านตอบ 400 VALIDATION_ERROR พร้อม details เป็น array ของข้อความ
 * (api-conventions.md ข้อ 4: ใช้ 400 ไม่ใช่ 422)
 */
import { ParseUUIDPipe, ValidationError, ValidationPipe } from '@nestjs/common';
import { validationError } from './api-error';

function flatten(errors: ValidationError[], parent = ''): string[] {
  const out: string[] = [];
  for (const e of errors) {
    const path = parent ? `${parent}.${e.property}` : e.property;
    for (const message of Object.values(e.constraints ?? {})) out.push(message.includes(path) ? message : `${path}: ${message}`);
    if (e.children && e.children.length > 0) out.push(...flatten(e.children, path));
  }
  return out;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => validationError(flatten(errors)),
  });
}

/** path parameter ต้องเป็น UUID v4 · ไม่ใช่ → 400 (api-conventions.md ข้อ 1) */
export const uuidParam = () =>
  new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () => validationError(['id ต้องเป็น UUID v4']),
  });
