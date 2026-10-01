import { ApiProperty } from '@nestjs/swagger';
import { PLAYABLE_CLASSES } from '@tower/engine';
import { IsIn } from 'class-validator';
import { CombatEventDto } from '../battles/battle.dto';

/** ขอดูตัวอย่างการรบของอาชีพหนึ่ง (playtest รอบ B ข้อ 3) */
export class CreateClassTrialDto {
  @ApiProperty({ enum: PLAYABLE_CLASSES, description: 'อาชีพที่อยากเห็นตัวอย่าง' })
  @IsIn(PLAYABLE_CLASSES as unknown as string[], {
    message: `classId ต้องเป็นหนึ่งใน ${PLAYABLE_CLASSES.join(' · ')}`,
  })
  classId!: string;
}

export class ClassTrialResultDto {
  @ApiProperty() victory!: boolean;
  @ApiProperty() wavesCleared!: number;
  @ApiProperty({ type: [CombatEventDto] }) events!: CombatEventDto[];
}

/** ตัวเลขสรุปของตัวละครในตัวอย่าง — ใช้เทียบอาชีพกันเป็นตาราง */
export class ClassTrialSummaryDto {
  @ApiProperty({ description: 'จำนวนเทิร์นที่ตัวละครได้ลงมือ' }) turns!: number;
  @ApiProperty({ description: 'ร่ายสกิลกี่ครั้ง' }) skillCasts!: number;
  @ApiProperty() damageDealt!: number;
  @ApiProperty() damageTaken!: number;
  @ApiProperty({ description: 'เลือดที่เหลือตอนจบ (% ของหลอด)' }) hpLeftPct!: number;
}

export class ClassTrialDto {
  @ApiProperty({ enum: PLAYABLE_CLASSES }) classId!: string;
  @ApiProperty({ description: 'เลเวลของตัวละครที่ใช้ (เลเวลปัจจุบัน)' }) level!: number;
  @ApiProperty({ description: 'ชั้นของเวฟตัวอย่าง (ชั้นที่ผ่านล่าสุด อย่างน้อย 1)' }) floor!: number;
  @ApiProperty({ description: 'จำนวนเวฟของตัวอย่าง' }) waves!: number;
  @ApiProperty({ description: 'โปรแกรมตัวอย่าง — เขียนด้วยไวยากรณ์ที่ใช้ได้ตั้งแต่ผ่านชั้น 1' }) program!: string;
  @ApiProperty({ type: [String], description: 'สกิลที่โปรแกรมตัวอย่างเรียก (ที่ปลดแล้วที่เลเวลนี้)' }) skills!: string[];
  @ApiProperty() maxHp!: number;
  @ApiProperty() maxMp!: number;
  @ApiProperty({ type: ClassTrialResultDto }) result!: ClassTrialResultDto;
  @ApiProperty({ type: ClassTrialSummaryDto }) summary!: ClassTrialSummaryDto;
}
