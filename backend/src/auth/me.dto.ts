import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CORE_ROLES } from './auth.types';
import { CORE_ROLE_TO_SUBSYSTEM_ROLE } from './role-mapping';

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

  @ApiPropertyOptional({ description: 'ค่า state ที่ส่งมากับ SSO callback (ส่งกลับให้ client ตรวจ)' })
  state?: string;
}
