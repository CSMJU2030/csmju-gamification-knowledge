import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';

export class CreateRegionRunDto {
  @ApiProperty({ example: 'frostland', description: 'id ของภูมิภาค (จาก GET /api/v1/regions)' })
  @IsString({ message: 'regionId ต้องเป็นข้อความ' })
  regionId!: string;

  @ApiProperty({ minimum: 1, description: 'รอบที่เท่าไรของโซน (เข้าได้ถึง maxDepthAllowed)' })
  @Type(() => Number)
  @IsInt({ message: 'ต้องระบุ depth เป็นจำนวนเต็ม' })
  @Min(1, { message: 'depth ต้องไม่น้อยกว่า 1' })
  depth!: number;
}

const HOTSPOT = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, r: { type: 'number' } },
} as const;

export class RegionDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() floorBase!: number;
  @ApiProperty({ description: 'จำนวนรอบของโซน (0 = เมือง ไม่มีการรบ)' }) depths!: number;
  @ApiProperty({ type: [Number], minItems: 2, maxItems: 2 }) floorRange!: number[];
  @ApiProperty() lessonTh!: string;
  @ApiProperty() eliteChance!: number;
  @ApiProperty(HOTSPOT) hotspot!: { x: number; y: number; r: number };
  @ApiProperty() depthCleared!: number;
  @ApiProperty() maxDepthAllowed!: number;
  @ApiProperty() completed!: boolean;
  @ApiProperty() unlocked!: boolean;
  @ApiProperty({ description: 'จำนวนผู้เล่นที่อยู่ในโซนนี้ตอนนี้' }) playersHere!: number;
}

export class EliteDto {
  @ApiProperty() wave!: number;
  @ApiProperty() archetypeId!: string;
  @ApiProperty() nameTh!: string;
}

export class DuelAnnounceDto {
  @ApiProperty() displayName!: string;
  @ApiProperty() classId!: string;
  @ApiProperty() level!: number;
  @ApiProperty({ description: 'true = อยู่ในโซนตอนนี้จริง · false = สแนปช็อต' }) live!: boolean;
}

export class LevelSyncDto {
  @ApiProperty() level!: number;
  @ApiProperty() realLevel!: number;
  @ApiProperty() applies!: boolean;
}

/** คำประกาศของรอบ — บอกก่อนรบเสมอว่าจะเจอ EX ไหม และดวลกับใคร */
export class RegionRunDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() regionId!: string;
  @ApiProperty() depth!: number;
  @ApiProperty() floor!: number;
  @ApiProperty() nameTh!: string;
  @ApiProperty() lessonTh!: string;
  @ApiPropertyOptional({ type: EliteDto, nullable: true }) elite!: EliteDto | null;
  @ApiPropertyOptional({ type: DuelAnnounceDto, nullable: true }) duel!: DuelAnnounceDto | null;
  @ApiPropertyOptional({ type: LevelSyncDto, nullable: true }) sync!: LevelSyncDto | null;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
