import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { CharacterDto, ItemDto, StatsDto } from '../characters/character.dto';
import { TOWER_MAX_FLOOR } from '../game/game-rules';
import { OptionalButNotNull } from '../common/validation';
import { DuelAnnounceDto, RegionRunDto, RegionSkillDto } from '../world/world.dto';

/**
 * ส่งอย่างใดอย่างหนึ่ง: `towerFloor` (ท้าทายหอคอย) · `regionRunId` (รบรอบที่เข้าไว้ในภูมิภาค) ·
 * `challengeId` (สู้กับมอนของโจทย์ — docs/design-challenge-monsters.md)
 */
export class CreateBattleDto {
  @ApiPropertyOptional({ minimum: 1, maximum: TOWER_MAX_FLOOR, description: 'ชั้นของหอคอยที่จะท้าทาย' })
  @OptionalButNotNull()
  @IsInt({ message: 'ต้องระบุ towerFloor เป็นจำนวนเต็ม' })
  @Min(1, { message: 'towerFloor ต้องไม่น้อยกว่า 1' })
  @Max(TOWER_MAX_FLOOR, { message: `towerFloor ต้องไม่เกิน ${TOWER_MAX_FLOOR}` })
  towerFloor?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'id ของรอบจาก POST /api/v1/region-runs' })
  @OptionalButNotNull()
  @IsUUID('4', { message: 'regionRunId ต้องเป็น UUID v4' })
  regionRunId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'id ของโจทย์ที่มีมอนของโจทย์' })
  @OptionalButNotNull()
  @IsUUID('4', { message: 'challengeId ต้องเป็น UUID v4' })
  challengeId?: string;
}

/** เป้าหนึ่งตัวในเหตุการณ์ — ตรงกับ CombatEvent['targets'][number] ของ engine */
export class CombatTargetDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() damage?: number;
  @ApiPropertyOptional() heal?: number;
  @ApiPropertyOptional() shield?: number;
  @ApiPropertyOptional() crit?: boolean;
  @ApiPropertyOptional() evaded?: boolean;
  @ApiPropertyOptional() killed?: boolean;
  @ApiProperty() hpAfter!: number;
}

/** หนึ่งการกระทำในบันทึกการรบ — ตรงกับ CombatEvent ของ engine */
export class CombatEventDto {
  @ApiProperty() turn!: number;
  @ApiProperty() wave!: number;
  @ApiProperty() actorId!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty({
    enum: ['attack', 'skill', 'defend', 'wait'],
    description: 'wait = เทิร์นที่โปรแกรมสั่ง wait() — ไม่มีเป้าหมาย มีแค่ mpAfter ที่ฟื้นขึ้น',
  })
  action!: 'attack' | 'skill' | 'defend' | 'wait';
  @ApiPropertyOptional() skillId?: string;
  @ApiProperty({ type: [CombatTargetDto] }) targets!: CombatTargetDto[];
  @ApiPropertyOptional({ enum: ['wave_start', 'wave_clear', 'defend', 'windup'] })
  note?: 'wave_start' | 'wave_clear' | 'defend' | 'windup';
  @ApiPropertyOptional({ description: 'บรรทัดในโปรแกรม BloxCode ที่ตัดสินใจเทิร์นนี้ (0 = การกระทำสำรอง)' }) line?: number;
  @ApiPropertyOptional({ type: [String], description: 'คำเตือนตอนรันโปรแกรม' }) codeWarnings?: string[];
  @ApiPropertyOptional({
    description: 'MP ของผู้ลงมือหลังจบเทิร์นนี้ (หักค่าร่ายและฟื้นตอนจบเทิร์นแล้ว) — ไม่มีใน event ของระบบ',
  })
  mpAfter?: number;
}

export class BattleDropsDto {
  @ApiProperty() gold!: number;
  @ApiProperty() materials!: number;
  @ApiProperty({ type: [ItemDto] }) items!: ItemDto[];
}

export class BattleResultDto {
  @ApiProperty() victory!: boolean;
  @ApiProperty() wavesCleared!: number;
  @ApiProperty({ type: [CombatEventDto], description: 'บันทึกการรบ (CombatEvent ของ engine)' })
  events!: CombatEventDto[];
  @ApiProperty({ type: BattleDropsDto }) drops!: BattleDropsDto;
  @ApiProperty() expGained!: number;
  @ApiProperty() seed!: number;
}

export class DuelBlockDto {
  @ApiProperty({ type: DuelAnnounceDto }) opponent!: DuelAnnounceDto;
  @ApiProperty({ type: [CombatEventDto] }) events!: CombatEventDto[];
  @ApiProperty() won!: boolean;
  @ApiProperty() byTimeout!: boolean;
  @ApiProperty() rounds!: number;
  @ApiProperty({ description: 'โปรแกรมของคู่ดวล — ฝ่ายแพ้เปิดดูได้ (รอบ 2W §5.4)' }) opponentProgram!: string;
}

/** ผลของครั้งก่อนที่จุดเดียวกัน */
export class PreviousAttemptDto {
  @ApiProperty() victory!: boolean;
  @ApiProperty() wavesCleared!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

/** ครั้งที่เท่าไรที่จุดเดียวกัน (ภูมิภาค + รอบ หรือ ชั้นหอคอย) — นับรวมครั้งนี้ */
export class BattleAttemptDto {
  @ApiProperty({ minimum: 1, description: 'ครั้งที่ของการรบที่จุดนี้ (1 = ครั้งแรก)' }) attemptNo!: number;
  @ApiProperty({ description: 'ครั้งแรกที่จุดนี้ — หน้าเว็บให้ดูฉากจนจบก่อน' }) firstAttempt!: boolean;
  @ApiProperty({ type: PreviousAttemptDto, nullable: true, description: 'ผลครั้งก่อนที่จุดนี้ (null = ไม่เคยรบ)' })
  previous!: PreviousAttemptDto | null;
}

export class ProofCheckDto {
  @ApiProperty({ description: 'รหัสคงที่ของเงื่อนไข เช่น deepest_win · handled · hp_floor' }) code!: string;
  @ApiProperty({ description: 'ข้อความพร้อมตัวเลขของการรบครั้งนี้' }) textTh!: string;
  @ApiProperty() ok!: boolean;
}

/** ผลตรวจบทเรียนของภูมิภาคในการรบครั้งนี้ (8 ต.ค. 2569 · ระยะ S1) */
export class RegionProofDto {
  @ApiProperty() regionId!: string;
  @ApiProperty({ description: 'การรบนี้นับไหม — ต้องเป็นรอบลึกสุดของภูมิภาค' }) eligible!: boolean;
  @ApiProperty({ description: 'นับ + ชนะ + ผ่านทุกเงื่อนไข' }) passed!: boolean;
  @ApiProperty({ description: 'พิสูจน์สำเร็จครั้งแรกในการรบนี้ (ได้สกิลตอนนี้)' }) newlyProved!: boolean;
  @ApiProperty({ type: [ProofCheckDto] }) checks!: ProofCheckDto[];
  @ApiProperty({ type: RegionSkillDto, nullable: true, description: 'สกิลของภูมิภาคนี้สำหรับอาชีพของคุณ (null = ผู้ฝึกหัด)' })
  skill!: RegionSkillDto | null;
}

/** รางวัลชนะครั้งแรก (ข้อ M4) — คิดจากเลเวลของผู้เล่น · ครั้งอื่นเป็น 0 */
export class ChallengeRewardDto {
  @ApiProperty() exp!: number;
  @ApiProperty() gold!: number;
}

/** ผลเฉพาะของการสู้กับมอนของโจทย์ */
export class ChallengeBattleDto {
  @ApiProperty({ format: 'uuid' }) challengeId!: string;
  @ApiProperty({ description: 'ชนะครั้งแรกของตัวละครนี้กับโจทย์นี้ — ได้รางวัลเฉพาะครั้งนี้' }) firstClear!: boolean;
  @ApiProperty({ type: ChallengeRewardDto }) reward!: ChallengeRewardDto;
}

export class BattleOutcomeDto {
  @ApiProperty({
    format: 'uuid',
    description: 'id ของบันทึกการรบแบบย่อ (GET /api/v1/battles) · การสู้กับมอนของโจทย์ = id ของผลใน challenge_attempts',
  })
  id!: string;
  @ApiProperty({ type: BattleResultDto }) result!: BattleResultDto;
  @ApiPropertyOptional({ type: RegionRunDto, description: 'มีเฉพาะการรบในภูมิภาค' }) announce?: RegionRunDto;
  @ApiPropertyOptional({ type: DuelBlockDto, nullable: true, description: 'มีเฉพาะการรบในภูมิภาค' })
  duel?: DuelBlockDto | null;
  @ApiPropertyOptional({
    type: RegionProofDto,
    nullable: true,
    description: 'มีเฉพาะการรบในภูมิภาค · null = ภูมิภาคนี้ไม่มีสกิลให้พิสูจน์',
  })
  proof?: RegionProofDto | null;
  @ApiProperty({ type: CharacterDto, description: 'ตัวละครหลังบันทึกผลแล้ว' }) character!: CharacterDto;
  @ApiProperty() leveledUp!: boolean;
  @ApiPropertyOptional() newLevel?: number;
  @ApiPropertyOptional({ type: StatsDto, description: 'สเตตัสที่ได้จากการเลเวลอัพรอบนี้' }) statsGained?: StatsDto;
  @ApiProperty({ type: BattleAttemptDto }) attempt!: BattleAttemptDto;
  @ApiPropertyOptional({ type: ChallengeBattleDto, description: 'มีเฉพาะการสู้กับมอนของโจทย์' })
  challenge?: ChallengeBattleDto;
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
