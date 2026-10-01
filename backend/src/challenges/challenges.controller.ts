/**
 * โจทย์ BloxCode (D4 — ร่าง)
 *   GET    /api/v1/challenges        ทุก role อ่านได้
 *   GET    /api/v1/challenges/:id
 *   POST   /api/v1/challenges        INSTRUCTOR · ADMIN
 *   PATCH  /api/v1/challenges/:id    เจ้าของ หรือ ADMIN
 *   DELETE /api/v1/challenges/:id    เจ้าของ หรือ ADMIN
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { Page } from '../common/envelope';
import { SearchPageQueryDto } from '../common/pagination.dto';
import { ApiErrors, ApiSuccess, DeletedDto } from '../common/swagger';
import { uuidParam } from '../common/validation';
import { ChallengeDto, CreateChallengeDto, UpdateChallengeDto } from './challenge.dto';
import { ChallengesService } from './challenges.service';

@ApiTags('challenges')
@Controller('v1/challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get()
  @RequirePermissions(Permission.CHALLENGE_READ)
  @ApiOperation({ summary: 'โจทย์ทั้งหมด ล่าสุดก่อน · q ค้นในชื่อและคำอธิบาย' })
  @ApiSuccess(ChallengeDto, { paginated: true })
  @ApiErrors(400, 401, 403)
  list(@Query() query: SearchPageQueryDto): Promise<Page<ChallengeDto>> {
    return this.challenges.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.CHALLENGE_READ)
  @ApiOperation({ summary: 'โจทย์หนึ่งข้อ' })
  @ApiSuccess(ChallengeDto)
  @ApiErrors(400, 401, 403, 404)
  get(@Param('id', uuidParam()) id: string): Promise<ChallengeDto> {
    return this.challenges.get(id);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions(Permission.CHALLENGE_CREATE)
  @ApiOperation({ summary: 'สร้างโจทย์ (ผู้สอน)' })
  @ApiSuccess(ChallengeDto, { status: 201 })
  @ApiErrors(400, 401, 403)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateChallengeDto): Promise<ChallengeDto> {
    return this.challenges.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CHALLENGE_UPDATE_OWN, Permission.CHALLENGE_UPDATE_ANY)
  @ApiOperation({ summary: 'แก้โจทย์ (เจ้าของหรือผู้ดูแล)' })
  @ApiSuccess(ChallengeDto)
  @ApiErrors(400, 401, 403, 404)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', uuidParam()) id: string,
    @Body() body: UpdateChallengeDto,
  ): Promise<ChallengeDto> {
    return this.challenges.update(user, id, body);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CHALLENGE_DELETE_OWN, Permission.CHALLENGE_DELETE_ANY)
  @ApiOperation({ summary: 'ลบโจทย์ (เจ้าของหรือผู้ดูแล)' })
  @ApiSuccess(DeletedDto)
  @ApiErrors(400, 401, 403, 404)
  remove(@CurrentUser() user: AuthUser, @Param('id', uuidParam()) id: string): Promise<{ id: string; deleted: true }> {
    return this.challenges.remove(user, id);
  }
}
