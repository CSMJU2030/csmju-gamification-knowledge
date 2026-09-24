/**
 * GET /api/v1/game-data — ตารางชื่อและค่าตั้งที่ UI ต้องใช้ (แทน GET /gamedata เดิม)
 *
 * ต่างจากเดิมหนึ่งข้อ: ส่งสกิลของทุกอาชีพ (พร้อม classId) แทนเฉพาะอาชีพของผู้เรียก
 * ข้อมูลนี้จึงไม่ผูกกับตัวละคร — ผู้สอนที่ยังไม่มีตัวละครก็อ่านได้ และ client กรองเองตาม classId
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { gamedata, type BaseStats, type SkillDef } from '@tower/engine';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import { RARITIES } from '../game/game-rules';

export class GameDataDto {
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'สกิลของทุกอาชีพและของมอนสเตอร์' })
  skills!: SkillDef[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) affixNames!: Record<string, string>;
  @ApiProperty({ type: [String] }) rarities!: string[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) baseItemNames!: Record<string, string>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'object' } })
  classes!: Record<string, { nameTh: string; growthHint: string; baseStats: BaseStats }>;
}

@ApiTags('game-data')
@Controller('v1/game-data')
export class GameDataController {
  @Get()
  @RequirePermissions(Permission.GAME_DATA_READ)
  @ApiOperation({ summary: 'ชื่อไทยของสกิล/ไอเทม/คุณสมบัติ + ข้อมูลอาชีพ' })
  @ApiSuccess(GameDataDto)
  @ApiErrors(401, 403)
  get(): GameDataDto {
    const affixNames: Record<string, string> = {};
    for (const a of gamedata.affixPool) affixNames[a.stat] = a.nameTh;
    const baseItemNames: Record<string, string> = {};
    for (const b of gamedata.baseItems) baseItemNames[b.baseId] = b.nameTh;
    const classes: GameDataDto['classes'] = {};
    for (const [id, cls] of Object.entries(gamedata.classes)) {
      classes[id] = { nameTh: cls.nameTh, growthHint: cls.growthHint, baseStats: cls.baseStats };
    }
    return { skills: gamedata.skills, affixNames, rarities: [...RARITIES], baseItemNames, classes };
  }
}
