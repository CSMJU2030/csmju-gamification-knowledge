/**
 * รอบในภูมิภาค
 *   POST   /api/v1/region-runs       เข้าโซน = ประกาศ EX/คู่ดวล (แทน POST /world/:id/enter เดิม)
 *   DELETE /api/v1/region-runs/:id   ออกจากโซน (แทน POST /world/leave เดิม)
 * การรบของรอบคือ POST /api/v1/battles { regionRunId }
 */
import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { ApiErrors, ApiSuccess, DeletedDto } from '../common/swagger';
import { uuidParam } from '../common/validation';
import { RegionRunsService } from './region-runs.service';
import { CreateRegionRunDto, RegionRunDto } from './world.dto';

@ApiTags('world')
@Controller('v1/region-runs')
export class RegionRunsController {
  constructor(private readonly runs: RegionRunsService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions(Permission.REGION_RUN_CREATE_OWN)
  @ApiOperation({ summary: 'เข้าโซน — คืนคำประกาศของรอบ (EX · คู่ดวล · ล็อกเลเวล)' })
  @ApiSuccess(RegionRunDto, { status: 201 })
  @ApiErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateRegionRunDto): Promise<RegionRunDto> {
    return this.runs.enter(user.coreUserId, body.regionId, body.depth);
  }

  @Delete(':id')
  @RequirePermissions(Permission.REGION_RUN_DELETE_OWN)
  @ApiOperation({ summary: 'ออกจากโซน' })
  @ApiSuccess(DeletedDto)
  @ApiErrors(400, 401, 403, 404)
  remove(@CurrentUser() user: AuthUser, @Param('id', uuidParam()) id: string): Promise<{ id: string; deleted: true }> {
    return this.runs.leave(user.coreUserId, id);
  }
}
