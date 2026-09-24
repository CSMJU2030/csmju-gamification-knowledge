/**
 * GET /api/health — public · อยู่นอก /api/v1 (api-conventions.md ข้อ 8)
 * `service` ต้องเท่ากับ name ใน subsystem.yaml และชื่อในทะเบียนของ Core Hub
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SUBSYSTEM_NAME } from '../config/env.validation';
import { ApiSuccess } from '../common/swagger';
import { HealthDto } from './health.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'ตรวจว่าระบบพร้อมใช้งาน (public)', security: [] })
  @ApiSuccess(HealthDto)
  check(): HealthDto {
    return { status: 'ok', service: SUBSYSTEM_NAME };
  }
}
