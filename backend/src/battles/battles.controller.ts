/**
 * การรบ
 *   POST /api/v1/battles          { towerFloor } หรือ { regionRunId } → ผลรบเต็ม + ตัวละครหลังบันทึก
 *   GET  /api/v1/battles          ประวัติการรบแบบย่อของผู้ใช้
 *   GET  /api/v1/tower-progress   ความคืบหน้าของหอคอย (แทน GET /tower เดิม)
 */
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { Page } from '../common/envelope';
import { SearchPageQueryDto } from '../common/pagination.dto';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import { BattleOutcomeDto, BattleSummaryDto, CreateBattleDto, TowerProgressDto } from './battle.dto';
import { BattlesService } from './battles.service';

@ApiTags('battles')
@Controller('v1/battles')
export class BattlesController {
  constructor(private readonly battles: BattlesService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions(Permission.BATTLE_CREATE_OWN)
  @ApiOperation({ summary: 'รบ — ท้าทายหอคอย (towerFloor) หรือรบรอบในภูมิภาค (regionRunId)' })
  @ApiSuccess(BattleOutcomeDto, { status: 201 })
  @ApiErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateBattleDto) {
    return this.battles.create(user.coreUserId, body);
  }

  @Get()
  @RequirePermissions(Permission.BATTLE_READ_OWN)
  @ApiOperation({ summary: 'ประวัติการรบแบบย่อ ล่าสุดก่อน · q ค้นในชื่อสถานที่ (หอคอย หรือชื่อภูมิภาค)' })
  @ApiSuccess(BattleSummaryDto, { paginated: true })
  @ApiErrors(400, 401, 403, 404)
  list(@CurrentUser() user: AuthUser, @Query() query: SearchPageQueryDto): Promise<Page<BattleSummaryDto>> {
    return this.battles.list(user.coreUserId, query);
  }
}

@ApiTags('battles')
@Controller('v1/tower-progress')
export class TowerProgressController {
  constructor(private readonly battles: BattlesService) {}

  @Get()
  @RequirePermissions(Permission.TOWER_PROGRESS_READ_OWN)
  @ApiOperation({ summary: 'ความคืบหน้าของหอคอย' })
  @ApiSuccess(TowerProgressDto)
  @ApiErrors(401, 403, 404)
  get(@CurrentUser() user: AuthUser): Promise<TowerProgressDto> {
    return this.battles.towerProgress(user.coreUserId);
  }
}
