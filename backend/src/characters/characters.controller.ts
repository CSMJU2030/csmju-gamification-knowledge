/**
 * ตัวละครของผู้ใช้ปัจจุบัน
 *   POST  /api/v1/characters           สร้างตัวละคร (แทน /auth/register เดิม) · ชื่อในเกม = รหัสจาก Core Hub /people/me
 *   GET   /api/v1/characters/current   แทน GET /me เดิม
 *   PATCH /api/v1/characters/current   เลือกอาชีพ (แทน POST /me/class เดิม)
 *   POST  /api/v1/characters/current/class-trials   ตัวอย่างการรบของอาชีพก่อนเลือก (ไม่บันทึก)
 */
import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { AccessToken } from '../auth/decorators/access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import type { CharacterView } from '../game/character.view';
import { CharacterDto, CreateCharacterDto, UpdateCharacterDto } from './character.dto';
import { ClassTrialDto, CreateClassTrialDto } from './class-trial.dto';
import { CharactersService, type ClassTrialView } from './characters.service';

@ApiTags('characters')
@Controller('v1/characters')
export class CharactersController {
  constructor(private readonly characters: CharactersService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions(Permission.CHARACTER_CREATE_OWN)
  @ApiOperation({
    summary: 'สร้างตัวละครของผู้ใช้ปัจจุบัน (หนึ่งคนมีได้ตัวเดียว)',
    description:
      'ชื่อในเกมคือ personCode (รหัสนักศึกษา/บุคลากร) ที่อ่านจาก Core Hub GET /people/me ด้วย token ของผู้ใช้ตอนสร้าง · ' +
      'บัญชีที่ไม่มีรหัสได้ 400 VALIDATION_ERROR (details ขึ้นต้นด้วย displayName) ให้ส่ง displayName มาใหม่ · ' +
      'Core Hub ล่มหรือจำกัดอัตรา → 503 พร้อม Retry-After',
  })
  @ApiSuccess(CharacterDto, { status: 201, description: 'สร้างแล้ว' })
  @ApiErrors(400, 401, 403, 409, 503)
  create(
    @CurrentUser() user: AuthUser,
    @AccessToken() accessToken: string,
    @Body() body: CreateCharacterDto,
  ): Promise<CharacterView> {
    return this.characters.create(user.coreUserId, accessToken, body.displayName);
  }

  @Get('current')
  @RequirePermissions(Permission.CHARACTER_READ_OWN)
  @ApiOperation({ summary: 'ตัวละครของผู้ใช้ปัจจุบัน' })
  @ApiSuccess(CharacterDto)
  @ApiErrors(401, 403, 404)
  current(@CurrentUser() user: AuthUser): Promise<CharacterView> {
    return this.characters.current(user.coreUserId);
  }

  @Patch('current')
  @RequirePermissions(Permission.CHARACTER_UPDATE_OWN)
  @ApiOperation({ summary: 'เลือกอาชีพ — ครั้งเดียว หลังผ่านชั้น 1' })
  @ApiSuccess(CharacterDto)
  @ApiErrors(400, 401, 403, 404, 409)
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateCharacterDto): Promise<CharacterView> {
    return this.characters.chooseClass(user.coreUserId, body.classId);
  }

  @Post('current/class-trials')
  @HttpCode(200)
  @RequirePermissions(Permission.CHARACTER_READ_OWN)
  @ApiOperation({
    summary: 'ตัวอย่างการรบของอาชีพก่อนเลือก — ตัวละครจริง เวฟเดียวกันทุกอาชีพ ไม่ได้รางวัลและไม่บันทึก',
  })
  @ApiSuccess(ClassTrialDto)
  @ApiErrors(400, 401, 403, 404, 409)
  classTrial(@CurrentUser() user: AuthUser, @Body() body: CreateClassTrialDto): Promise<ClassTrialView> {
    return this.characters.classTrial(user.coreUserId, body.classId);
  }
}
