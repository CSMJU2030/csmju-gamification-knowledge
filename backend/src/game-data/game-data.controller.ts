/**
 * GET /api/v1/game-data — ตารางชื่อและค่าตั้งที่ UI ต้องใช้ (แทน GET /gamedata เดิม)
 *
 * ต่างจากเดิมหนึ่งข้อ: ส่งสกิลของทุกอาชีพ (พร้อม classId) แทนเฉพาะอาชีพของผู้เรียก
 * ข้อมูลนี้จึงไม่ผูกกับตัวละคร — ผู้สอนที่ยังไม่มีตัวละครก็อ่านได้ และ client กรองเองตาม classId
 */
import { Controller, Get } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { StatsDto } from '../characters/character.dto';
import { gamedata, type BaseStats, type SkillDef } from '@tower/engine';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import { RARITIES } from '../game/game-rules';
import { allRegions } from '../game/world';

/** SkillDef ของ engine */
export class SkillDefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty({ enum: ['novice', 'warrior', 'mage', 'guardian', 'monster'] }) classId!: string;
  @ApiProperty({ enum: ['physical', 'magic', 'heal', 'shield', 'taunt'] }) kind!: string;
  @ApiProperty({
    description: 'physical/magic = % ของ atk/matk (100 = 1 เท่า) · heal = % ของเลือดสูงสุดของเป้า · shield = % ของเลือดสูงสุดของผู้ร่าย · taunt ไม่ใช้',
  })
  power!: number;
  @ApiProperty() mpCost!: number;
  @ApiProperty() aoe!: boolean;
  @ApiProperty() unlockLevel!: number;
  @ApiPropertyOptional({ description: 'คำอธิบายสำหรับผู้เล่น (มีเฉพาะสกิลของอาชีพ)' }) descTh?: string;
  @ApiPropertyOptional({ description: 'ชื่อแอนิเมชันเอฟเฟกต์ที่ฉากรบใช้วาด' }) animation?: string;
}

export class ClassInfoDto {
  @ApiProperty() nameTh!: string;
  @ApiProperty() growthHint!: string;
  @ApiProperty({ type: StatsDto }) baseStats!: StatsDto;
}

/** ชื่อภูมิภาค — ไม่ผูกกับตัวละคร (GET /regions ต้องมีตัวละครเพราะคิดความคืบหน้าด้วย) */
export class RegionNameDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty({ description: 'จำนวนรอบของโซน (0 = เมือง ไม่มีการรบ)' }) depths!: number;
}

export class GameDataDto {
  @ApiProperty({ type: [SkillDefDto], description: 'สกิลของทุกอาชีพและของมอนสเตอร์' })
  skills!: SkillDef[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) affixNames!: Record<string, string>;
  @ApiProperty({ type: [String] }) rarities!: string[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) baseItemNames!: Record<string, string>;
  @ApiProperty({ type: 'object', additionalProperties: { $ref: getSchemaPath(ClassInfoDto) } })
  classes!: Record<string, { nameTh: string; growthHint: string; baseStats: BaseStats }>;
  @ApiProperty({ type: [RegionNameDto], description: 'ภูมิภาคทั้งหมดบนแผนที่ (id + ชื่อไทย) — ใช้กับฟอร์มโจทย์และประวัติการรบ' })
  regions!: RegionNameDto[];
}

@ApiTags('game-data')
@ApiExtraModels(ClassInfoDto)
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
    const regions = allRegions().map((r) => ({ id: r.id, nameTh: r.nameTh, depths: r.depths }));
    return { skills: gamedata.skills, affixNames, rarities: [...RARITIES], baseItemNames, classes, regions };
  }
}
