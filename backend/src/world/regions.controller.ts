/** GET /api/v1/regions — แผนที่โลก: ภูมิภาคทั้งหมดพร้อมความคืบหน้าของผู้ใช้ (แทน GET /world เดิม) */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { Page } from '../common/envelope';
import { PageQueryDto } from '../common/pagination.dto';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import { RegionRunsService } from './region-runs.service';
import { RegionDto } from './world.dto';

@ApiTags('world')
@Controller('v1/regions')
export class RegionsController {
  constructor(private readonly runs: RegionRunsService) {}

  @Get()
  @RequirePermissions(Permission.REGION_READ)
  @ApiOperation({ summary: 'ภูมิภาคบนแผนที่ + ความคืบหน้าของผู้ใช้ + จำนวนผู้เล่นในโซน' })
  @ApiSuccess(RegionDto, { paginated: true })
  @ApiErrors(400, 401, 403, 404)
  list(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto): Promise<Page<RegionDto>> {
    return this.runs.listRegions(user.coreUserId, query);
  }
}
