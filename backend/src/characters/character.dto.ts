import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PLAYABLE_CLASSES } from '@tower/engine';
import { IsIn, IsString, Matches } from 'class-validator';

/** ชื่อที่ผู้เล่นตั้งเอง (D5) — ไทย/อังกฤษ/ตัวเลข/ขีดล่าง 3-20 ตัว · ชื่อนี้จะโชว์ให้คู่ดวลเห็น */
export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9_฀-๿]{3,20}$/;

export class CreateCharacterDto {
  @ApiProperty({ example: 'นักสู้หมายเลข1', pattern: DISPLAY_NAME_PATTERN.source })
  @IsString({ message: 'displayName ต้องเป็นข้อความ' })
  @Matches(DISPLAY_NAME_PATTERN, {
    message: 'displayName ต้องยาว 3-20 ตัว ใช้ได้เฉพาะอักษรไทย a-z A-Z 0-9 และ _',
  })
  displayName!: string;
}

export class UpdateCharacterDto {
  @ApiProperty({ enum: PLAYABLE_CLASSES, description: 'เลือกอาชีพได้ครั้งเดียว หลังผ่านชั้น 1' })
  @IsIn(PLAYABLE_CLASSES as unknown as string[], {
    message: `classId ต้องเป็นหนึ่งใน ${PLAYABLE_CLASSES.join(' · ')}`,
  })
  classId!: string;
}

export class StatsDto {
  @ApiProperty() str!: number;
  @ApiProperty() int!: number;
  @ApiProperty() vit!: number;
  @ApiProperty() agi!: number;
  @ApiProperty() luk!: number;
}

export class ItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() baseId!: string;
  @ApiProperty({ enum: ['weapon', 'armor', 'helmet', 'accessory'] }) slot!: string;
  @ApiProperty({ enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'] }) rarity!: string;
  @ApiProperty() upgradeLevel!: number;
  @ApiProperty() droppedFloor!: number;
  @ApiProperty({ type: 'array', items: { type: 'object', properties: { stat: { type: 'string' }, value: { type: 'number' } } } })
  affixes!: { stat: string; value: number }[];
  @ApiProperty() nameTh!: string;
  @ApiProperty({ type: 'object', properties: { stat: { type: 'string' }, value: { type: 'number' } } })
  mainStat!: { stat: string; value: number };
  @ApiProperty() equipped!: boolean;
}

export class SkillSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() unlockLevel!: number;
  @ApiProperty() mpCost!: number;
  @ApiProperty() kind!: string;
  @ApiProperty() aoe!: boolean;
}

const PROF_TRIPLE = {
  type: 'object',
  properties: { str: { type: 'number' }, int: { type: 'number' }, vit: { type: 'number' } },
} as const;

export class ProficiencyDto {
  @ApiProperty(PROF_TRIPLE) work!: Record<string, number>;
  @ApiProperty(PROF_TRIPLE) share!: Record<string, number>;
  @ApiProperty(PROF_TRIPLE) projectedPoints!: Record<string, number>;
  @ApiProperty() pointsPerLevel!: number;
  @ApiProperty() usingClassDefault!: boolean;
}

export class EquipmentDto {
  @ApiPropertyOptional({ type: ItemDto, nullable: true }) weapon!: ItemDto | null;
  @ApiPropertyOptional({ type: ItemDto, nullable: true }) armor!: ItemDto | null;
  @ApiPropertyOptional({ type: ItemDto, nullable: true }) helmet!: ItemDto | null;
  @ApiPropertyOptional({ type: ItemDto, nullable: true }) accessory!: ItemDto | null;
}

export class CharacterDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ['novice', ...PLAYABLE_CLASSES] }) classId!: string;
  @ApiProperty() level!: number;
  @ApiProperty() exp!: number;
  @ApiProperty() expToNext!: number;
  @ApiProperty({ type: ProficiencyDto }) proficiency!: ProficiencyDto;
  @ApiProperty({ type: StatsDto }) stats!: StatsDto;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' }, description: 'ค่าที่คำนวณแล้ว (maxHp, atk, …)' })
  derived!: Record<string, number>;
  @ApiProperty() gold!: number;
  @ApiProperty() materials!: number;
  @ApiProperty({ type: EquipmentDto }) equipment!: EquipmentDto;
  @ApiProperty({ type: [SkillSummaryDto] }) skills!: SkillSummaryDto[];
  @ApiProperty() highestFloorCleared!: number;
}
