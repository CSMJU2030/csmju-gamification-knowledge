import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CharacterDto, ItemDto, StatsDto } from '../characters/character.dto';
import { TOWER_MAX_FLOOR } from '../game/game-rules';
import { DuelAnnounceDto, RegionRunDto } from '../world/world.dto';

/** ส่งอย่างใดอย่างหนึ่ง: `towerFloor` (ท้าทายหอคอย) หรือ `regionRunId` (รบรอบที่เข้าไว้ในภูมิภาค) */
export class CreateBattleDto {
  @ApiPropertyOptional({ minimum: 1, maximum: TOWER_MAX_FLOOR, description: 'ชั้นของหอคอยที่จะท้าทาย' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'ต้องระบุ towerFloor เป็นจำนวนเต็ม' })
  @Min(1, { message: 'towerFloor ต้องไม่น้อยกว่า 1' })
  @Max(TOWER_MAX_FLOOR, { message: `towerFloor ต้องไม่เกิน ${TOWER_MAX_FLOOR}` })
  towerFloor?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'id ของรอบจาก POST /api/v1/region-runs' })
  @IsOptional()
  @IsUUID('4', { message: 'regionRunId ต้องเป็น UUID v4' })
  regionRunId?: string;
}

export class BattleDropsDto {
  @ApiProperty() gold!: number;
  @ApiProperty() materials!: number;
  @ApiProperty({ type: [ItemDto] }) items!: ItemDto[];
}

export class BattleResultDto {
  @ApiProperty() victory!: boolean;
  @ApiProperty() wavesCleared!: number;
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'บันทึกการรบ (CombatEvent ของ engine)' })
  events!: object[];
  @ApiProperty({ type: BattleDropsDto }) drops!: BattleDropsDto;
  @ApiProperty() expGained!: number;
  @ApiProperty() seed!: number;
}

export class DuelBlockDto {
  @ApiProperty({ type: DuelAnnounceDto }) opponent!: DuelAnnounceDto;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) events!: object[];
  @ApiProperty() won!: boolean;
  @ApiProperty() byTimeout!: boolean;
  @ApiProperty() rounds!: number;
  @ApiProperty({ description: 'โปรแกรมของคู่ดวล — ฝ่ายแพ้เปิดดูได้ (รอบ 2W §5.4)' }) opponentProgram!: string;
}

export class BattleOutcomeDto {
  @ApiProperty({ format: 'uuid', description: 'id ของบันทึกการรบแบบย่อ (GET /api/v1/battles)' }) id!: string;
  @ApiProperty({ type: BattleResultDto }) result!: BattleResultDto;
  @ApiPropertyOptional({ type: RegionRunDto, description: 'มีเฉพาะการรบในภูมิภาค' }) announce?: RegionRunDto;
  @ApiPropertyOptional({ type: DuelBlockDto, nullable: true, description: 'มีเฉพาะการรบในภูมิภาค' })
  duel?: DuelBlockDto | null;
  @ApiProperty({ type: CharacterDto, description: 'ตัวละครหลังบันทึกผลแล้ว' }) character!: CharacterDto;
  @ApiProperty() leveledUp!: boolean;
  @ApiPropertyOptional() newLevel?: number;
  @ApiPropertyOptional({ type: StatsDto, description: 'สเตตัสที่ได้จากการเลเวลอัพรอบนี้' }) statsGained?: StatsDto;
}

export class BattleSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() regionId!: string;
  @ApiProperty() depth!: number;
  @ApiProperty() floor!: number;
  @ApiProperty() victory!: boolean;
  @ApiProperty() wavesCleared!: number;
  @ApiProperty() expGained!: number;
  @ApiProperty() goldGained!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class TowerProgressDto {
  @ApiProperty({ description: 'ชั้นสูงสุดของหอคอยที่ผ่านแล้ว (ใบคะแนนของหอคอยเอง)' }) highestFloorCleared!: number;
  @ApiProperty() maxFloor!: number;
  @ApiProperty({ description: 'ความยากสูงสุดที่ผ่านแล้ว "ที่ไหนก็ได้" — ตัวปลดล็อกภูมิภาคและไวยากรณ์' })
  globalHighestFloor!: number;
}
