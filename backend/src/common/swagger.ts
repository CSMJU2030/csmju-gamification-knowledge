/**
 * decorator ช่วยเขียน OpenAPI ให้ตรงกับ envelope จริง — openapi.json เป็นสัญญาที่ frontend
 * ใช้ generate type (tech-stack.md ข้อ 3) จึงต้องบอกรูปของ `data` / `meta` / `error` ให้ครบ
 */
import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiProperty, ApiPropertyOptional, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import type { ReferenceObject, SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ERROR_HTTP_STATUS } from './api-error';

export class PageMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}

export class ErrorDetailDto {
  @ApiProperty({ enum: Object.keys(ERROR_HTTP_STATUS) }) code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ type: [String], description: 'ใช้กับ VALIDATION_ERROR' }) details?: string[];
}

export class ErrorEnvelopeDto {
  @ApiProperty({ enum: [false] }) success!: false;
  @ApiProperty({ type: ErrorDetailDto }) error!: ErrorDetailDto;
}

export class DeletedDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: [true] }) deleted!: true;
}

interface SuccessOptions {
  status?: number;
  paginated?: boolean;
  description?: string;
}

/** response สำเร็จ: `{ success: true, data }` หรือคอลเลกชัน `{ success: true, data: [], meta }` */
export function ApiSuccess(model: Type<unknown>, options: SuccessOptions = {}) {
  const { status = 200, paginated = false, description = 'สำเร็จ' } = options;
  const data: SchemaObject | ReferenceObject = paginated
    ? { type: 'array', items: { $ref: getSchemaPath(model) } }
    : { $ref: getSchemaPath(model) };
  const properties: Record<string, SchemaObject | ReferenceObject> = {
    success: { type: 'boolean', enum: [true] },
    data,
  };
  const required = ['success', 'data'];
  if (paginated) {
    properties.meta = { $ref: getSchemaPath(PageMetaDto) };
    required.push('meta');
  }
  return applyDecorators(
    ApiExtraModels(model, PageMetaDto),
    ApiResponse({ status, description, schema: { type: 'object', required, properties } }),
  );
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'BAD_REQUEST หรือ VALIDATION_ERROR',
  401: 'UNAUTHORIZED — ไม่มี token หรือ token ใช้ไม่ได้',
  403: 'FORBIDDEN — สิทธิ์ไม่พอ',
  404: 'NOT_FOUND',
  409: 'CONFLICT — สถานะปัจจุบันไม่อนุญาต',
  503: 'SERVICE_UNAVAILABLE — ระบบที่พึ่ง (Core Hub) ไม่พร้อมชั่วคราว · มี header Retry-After',
};

/** response ผิดพลาดที่ endpoint นี้ตอบได้ — ทุกตัวเป็น error envelope เดียวกัน */
export function ApiErrors(...statuses: number[]) {
  return applyDecorators(
    ApiExtraModels(ErrorEnvelopeDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'ข้อผิดพลาด',
        schema: { $ref: getSchemaPath(ErrorEnvelopeDto) },
      }),
    ),
  );
}
