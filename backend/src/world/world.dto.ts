import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';
import { NoNulCharacter } from '../common/validation';

export class CreateRegionRunDto {
  @ApiProperty({ example: 'frostland', description: 'id ของภูมิภาค (จาก GET /api/v1/regions)' })
  @IsString({ message: 'regionId ต้องเป็นข้อความ' })
  @MaxLength(64, { message: 'regionId ยาวเกินไป' })
  @NoNulCharacter('regionId')
  regionId!: string;

  @ApiProperty({ minimum: 1, description: 'รอบที่เท่าไรของโซน (เข้าได้ถึง maxDepthAllowed)' })
  @IsInt({ message: 'ต้องระบุ depth เป็นจำนวนเต็ม' })
  @Min(1, { message: 'depth ต้องไม่น้อยกว่า 1' })
  depth!: number;
}

/** ตำแหน่งบนภาพแผนที่ เป็นสัดส่วน 0..1 ของความกว้าง/สูง */
export class HotspotDto {
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
  @ApiProperty({ description: 'รัศมี (สัดส่วนของความกว้าง)' }) r!: number;
}

/** สกิลประจำภูมิภาคของอาชีพผู้เล่น (8 ต.ค. 2569 · ระยะ S1) */
export class RegionSkillDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty({ enum: ['physical', 'magic', 'heal', 'shield', 'taunt'] }) kind!: string;
  @ApiProperty() mpCost!: number;
  @ApiProperty() aoe!: boolean;
}

/** การพิสูจน์บทเรียนของภูมิภาค — มีเฉพาะภูมิภาคที่มีสกิลให้ */
export class RegionProofInfoDto {
  @ApiProperty({ type: [String], description: 'เงื่อนไขที่ต้องทำให้ครบในการรบครั้งเดียว (ข้อแรก = ชนะรอบลึกสุด)' })
  requirementsTh!: string[];
  @ApiProperty({ description: 'ตัวละครนี้พิสูจน์ภูมิภาคนี้แล้ว' }) proved!: boolean;
  @ApiProperty({ type: RegionSkillDto, nullable: true, description: 'สกิลที่จะได้/ได้แล้วสำหรับอาชีพของคุณ (null = ผู้ฝึกหัด ยังไม่มีอาชีพ)' })
  skill!: RegionSkillDto | null;
}

export class RegionDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() floorBase!: number;
  @ApiProperty({ description: 'จำนวนรอบของโซน (0 = เมือง ไม่มีการรบ)' }) depths!: number;
  @ApiProperty({ type: [Number], minItems: 2, maxItems: 2 }) floorRange!: number[];
  @ApiProperty() lessonTh!: string;
  @ApiProperty() eliteChance!: number;
  @ApiProperty({ type: HotspotDto }) hotspot!: { x: number; y: number; r: number };
  @ApiProperty() depthCleared!: number;
  @ApiProperty() maxDepthAllowed!: number;
  @ApiProperty() completed!: boolean;
  @ApiProperty() unlocked!: boolean;
  @ApiProperty({ description: 'จำนวนผู้เล่นที่อยู่ในโซนนี้ตอนนี้' }) playersHere!: number;
  @ApiProperty({ type: RegionProofInfoDto, nullable: true, description: 'สกิลประจำภูมิภาค (null = หอคอย · เมือง ไม่มีสกิลให้พิสูจน์)' })
  proof!: RegionProofInfoDto | null;
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
