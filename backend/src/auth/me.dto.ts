import { ApiProperty } from '@nestjs/swagger';
import { CORE_ROLES } from './auth.types';
import { CORE_ROLE_TO_SUBSYSTEM_ROLE } from './role-mapping';

/** เวลาหมดอายุของ session (สัญญา 1.1 ข้อ 5) — ให้ frontend ต่ออายุล่วงหน้าผ่าน /auth/login ก่อนหน้าที่มีงานค้างจะเจอ 401 */
export class SessionInfoDto {
  @ApiProperty({ format: 'date-time', description: 'คำนวณจาก exp ของ token (ISO 8601)' })
  expiresAt!: string;
}

export class MeDto {
  @ApiProperty({ description: 'ค่า sub จาก Core Hub token (Global Identity)' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: CORE_ROLES })
  coreRole!: string;

  @ApiProperty({ enum: [...new Set(Object.values(CORE_ROLE_TO_SUBSYSTEM_ROLE))] })
  subsystemRole!: string;

  @ApiProperty({ type: [String], description: 'permission ของ role นี้ในระบบ Code Tower' })
  permissions!: string[];

  @ApiProperty({ type: SessionInfoDto })
  session!: SessionInfoDto;
}
