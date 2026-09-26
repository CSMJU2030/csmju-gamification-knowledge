/**
 * ตรวจ environment ตอนบูต — ค่าผิดต้องล้มตั้งแต่เริ่ม ไม่ใช่ไปพังตอนมีคนเรียก API
 */
import { plainToInstance } from 'class-transformer';
import {
  IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, validateSync,
} from 'class-validator';

/** ชื่อระบบย่อยนี้ในทะเบียน Core Hub — ต้องตรงกับ subsystem.yaml และ data.service ของ /api/health */
export const SUBSYSTEM_NAME = 'csmju-gamification-knowledge';

class EnvironmentVariables {
  @IsOptional() @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsOptional() @IsInt() @Min(1) @Max(65535)
  PORT?: number;

  @IsString() @IsNotEmpty()
  DATABASE_URL!: string;

  @IsIn([SUBSYSTEM_NAME])
  SUBSYSTEM_ID!: string;

  @IsString() @IsNotEmpty()
  CORE_HUB_URL!: string;

  @IsString() @IsNotEmpty()
  CORE_HUB_JWKS_URL!: string;

  /** ค่าคงที่ของสัญญา (jwt-contract.json) — ตั้งผิดแปลว่า token จริงทุกใบจะถูกปฏิเสธ */
  @IsIn(['core-hub'])
  CORE_HUB_ISSUER!: string;

  @IsIn(['csmju2030'])
  CORE_HUB_AUDIENCE!: string;

  @IsOptional() @IsInt() @Min(1000)
  JWKS_CACHE_TTL_MS?: number;

  /** สัญญาข้อ 4.1: รีเฟรช JWKS ได้ไม่ถี่กว่า 30 วินาทีต่อครั้ง */
  @IsOptional() @IsInt() @Min(30_000)
  JWKS_MIN_REFRESH_INTERVAL_MS?: number;

  @IsOptional() @IsInt() @Min(100)
  JWKS_REQUEST_TIMEOUT_MS?: number;

  /** สัญญาข้อ 4 ขั้นที่ 7: clock skew ไม่เกิน 60 วินาที */
  @IsOptional() @IsInt() @Min(0) @Max(60)
  JWT_CLOCK_TOLERANCE_SEC?: number;

  @IsOptional() @IsString()
  SSO_SUCCESS_REDIRECT?: string;
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const lines = errors.map((e) => `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`);
    throw new Error(`ค่า environment ไม่ถูกต้อง:\n${lines.join('\n')}`);
  }
  return config;
}
