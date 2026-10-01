import { ApiProperty } from '@nestjs/swagger';
import { PLAYABLE_CLASSES } from '@tower/engine';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

/**
 * ชื่อสำรองที่ตั้งเอง — ใช้เฉพาะบัญชีที่ Core Hub ไม่มีรหัสให้ (/people/me ได้ null) · ไทย/อังกฤษ/ตัวเลข/ขีดล่าง 3-20 ตัว
 * ต้องมีอักษรไทยอย่างน้อย 1 ตัว: รหัสนักศึกษา/บุคลากรเป็นอักษรอังกฤษกับตัวเลขล้วน ชื่อสำรองจึงไม่มีวันซ้ำหรือปลอมเป็นรหัสของใคร
 */
export const DISPLAY_NAME_PATTERN = /^(?=.*[฀-๿])[A-Za-z0-9_฀-๿]{3,20}$/;

export class CreateCharacterDto {
  @ApiProperty({
    required: false,
    example: 'นักสู้หมายเลข1',
    pattern: DISPLAY_NAME_PATTERN.source,
    description:
      'ไม่ต้องส่งตามปกติ — ชื่อในเกมคือรหัสนักศึกษา/บุคลากรจาก Core Hub · ส่งเฉพาะเมื่อได้ 400 ที่บอกว่าบัญชีนี้ไม่มีรหัส (ถ้ามีรหัส ค่านี้ถูกละไว้)',
  })
  @IsOptional()
  @IsString({ message: 'displayName ต้องเป็นข้อความ' })
  @Matches(DISPLAY_NAME_PATTERN, {
    message: 'displayName ต้องยาว 3-20 ตัว มีอักษรไทยอย่างน้อย 1 ตัว ใช้ได้เฉพาะอักษรไทย a-z A-Z 0-9 และ _',
  })
  displayName?: string;
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

/** ค่าที่คำนวณแล้วจากสเตตัส + อุปกรณ์ (DerivedStats ของ engine) */
export class DerivedStatsDto {
  @ApiProperty() maxHp!: number;
  @ApiProperty() maxMp!: number;
  @ApiProperty({ description: 'พลังโจมตีกายภาพ' }) atk!: number;
  @ApiProperty({ description: 'พลังเวท' }) matk!: number;
  @ApiProperty() def!: number;
  @ApiProperty() mdef!: number;
  @ApiProperty() speed!: number;
  @ApiProperty({ description: '0..1' }) critRate!: number;
  @ApiProperty({ description: 'ตัวคูณ เช่น 1.5' }) critDmg!: number;
  @ApiProperty({ description: '0..1' }) evasion!: number;
  @ApiProperty({ description: '0..1' }) dropBonus!: number;
}

export class StatValueDto {
  @ApiProperty() stat!: string;
  @ApiProperty() value!: number;
}

export class ItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() baseId!: string;
  @ApiProperty({ enum: ['weapon', 'armor', 'helmet', 'accessory'] }) slot!: string;
  @ApiProperty({ enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'] }) rarity!: string;
  @ApiProperty() upgradeLevel!: number;
  @ApiProperty() droppedFloor!: number;
  @ApiProperty({ type: [StatValueDto], description: 'คุณสมบัติเสริม' })
  affixes!: StatValueDto[];
  @ApiProperty() nameTh!: string;
  @ApiProperty({ type: StatValueDto, description: 'ค่าหลักหลังตีบวกแล้ว' })
  mainStat!: StatValueDto;
  @ApiProperty() equipped!: boolean;
}

export class SkillSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() unlockLevel!: number;
  @ApiProperty() mpCost!: number;
  @ApiProperty({ enum: ['physical', 'magic', 'heal', 'shield', 'taunt'] }) kind!: string;
  @ApiProperty() aoe!: boolean;
}

/** ความชำนาญเฉพาะสามช่องที่ผู้เล่นควบคุมได้ (agi/luk โตเอง) */
export class ProficiencyTripleDto {
  @ApiProperty() str!: number;
  @ApiProperty() int!: number;
  @ApiProperty() vit!: number;
}

export class ProficiencyDto {
  @ApiProperty({ type: ProficiencyTripleDto, description: 'งานดิบตั้งแต่เลเวลที่แล้ว' }) work!: ProficiencyTripleDto;
  @ApiProperty({ type: ProficiencyTripleDto, description: 'สัดส่วนหลังถ่วงน้ำหนัก รวม 1.0' }) share!: ProficiencyTripleDto;
  @ApiProperty({ type: ProficiencyTripleDto, description: 'ถ้าเลเวลอัพตอนนี้จะได้ช่องละกี่แต้ม' }) projectedPoints!: ProficiencyTripleDto;
  @ApiProperty() pointsPerLevel!: number;
  @ApiProperty() usingClassDefault!: boolean;
}

export class EquipmentDto {
  @ApiProperty({ type: ItemDto, nullable: true }) weapon!: ItemDto | null;
  @ApiProperty({ type: ItemDto, nullable: true }) armor!: ItemDto | null;
  @ApiProperty({ type: ItemDto, nullable: true }) helmet!: ItemDto | null;
  @ApiProperty({ type: ItemDto, nullable: true }) accessory!: ItemDto | null;
}

export class CharacterDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'ชื่อที่ผู้เล่นคนอื่นเห็น — รหัสนักศึกษา/บุคลากรจาก Core Hub หรือชื่อสำรองของบัญชีที่ไม่มีรหัส' })
  displayName!: string;
  @ApiProperty({ enum: ['novice', ...PLAYABLE_CLASSES] }) classId!: string;
  @ApiProperty() level!: number;
  @ApiProperty() exp!: number;
  @ApiProperty() expToNext!: number;
  @ApiProperty({ type: ProficiencyDto }) proficiency!: ProficiencyDto;
  @ApiProperty({ type: StatsDto }) stats!: StatsDto;
  @ApiProperty({ type: DerivedStatsDto, description: 'ค่าที่คำนวณแล้ว (maxHp, atk, …)' })
  derived!: DerivedStatsDto;
  @ApiProperty() gold!: number;
  @ApiProperty() materials!: number;
  @ApiProperty({ type: EquipmentDto }) equipment!: EquipmentDto;
  @ApiProperty({ type: [SkillSummaryDto] }) skills!: SkillSummaryDto[];
  @ApiProperty() highestFloorCleared!: number;
}
