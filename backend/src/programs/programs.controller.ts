/**
 * โปรแกรม BloxCode ของผู้ใช้ปัจจุบัน
 *   GET   /api/v1/programs/current   แทน GET /program เดิม
 *   PATCH /api/v1/programs/current   แทน PUT /program เดิม (มาตรฐานให้เลี่ยง PUT)
 */
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import { ProgramDto, UpdateProgramDto } from './program.dto';
import { ProgramsService } from './programs.service';

@ApiTags('programs')
@Controller('v1/programs')
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get('current')
  @RequirePermissions(Permission.PROGRAM_READ_OWN)
  @ApiOperation({ summary: 'โปรแกรมปัจจุบัน + ไวยากรณ์และสกิลที่ใช้ได้' })
  @ApiSuccess(ProgramDto)
  @ApiErrors(401, 403, 404)
  current(@CurrentUser() user: AuthUser): Promise<ProgramDto> {
    return this.programs.current(user.coreUserId);
  }

  @Patch('current')
  @RequirePermissions(Permission.PROGRAM_UPDATE_OWN)
  @ApiOperation({
    summary: 'บันทึกโปรแกรม — ไม่ผ่าน parse/validate ตอบ 400 VALIDATION_ERROR',
    description: 'details แต่ละตัวเป็น "<บรรทัด>:<คอลัมน์>:<ชื่อข้อผิดพลาด>:<ข้อความไทย>"',
  })
  @ApiSuccess(ProgramDto)
  @ApiErrors(400, 401, 403, 404)
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateProgramDto): Promise<ProgramDto> {
    return this.programs.update(user.coreUserId, body.source);
  }
}
