/** GET /api/v1/me — ตัวตนของผู้ใช้ปัจจุบัน จาก Core Hub token ที่ตรวจแล้ว (contracts/openapi.yaml) */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import type { AuthUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { MeDto } from './me.dto';

export function toMe(user: AuthUser): MeDto {
  return {
    id: user.coreUserId,
    email: user.email,
    coreRole: user.coreRole,
    subsystemRole: user.subsystemRole,
    permissions: [...user.permissions].sort(),
    session: { expiresAt: new Date(user.tokenExp * 1000).toISOString() },
  };
}

@ApiTags('auth')
@Controller('v1/me')
export class MeController {
  @Get()
  @ApiOperation({ summary: 'ตัวตนของผู้ใช้ปัจจุบัน' })
  @ApiSuccess(MeDto)
  @ApiErrors(401, 403)
  me(@CurrentUser() user: AuthUser): MeDto {
    return toMe(user);
  }
}
