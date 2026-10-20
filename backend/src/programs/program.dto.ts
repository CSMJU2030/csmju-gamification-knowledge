import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { SkillSlotsDto } from '../characters/character.dto';
import { NoNulCharacter } from '../common/validation';
import { MAX_PROGRAM_CHARS } from '../game/game-rules';

export class UpdateProgramDto {
  @ApiProperty({ description: 'โปรแกรม BloxCode (Python subset) — ต้องมี def turn():', maxLength: MAX_PROGRAM_CHARS })
  @IsString({ message: 'source ต้องเป็นข้อความ' })
  @NoNulCharacter('source')
  source!: string;
}

export class ProgramSkillDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() mpCost!: number;
  @ApiProperty() aoe!: boolean;
  @ApiProperty({ enum: [1, 2], description: 'ขั้นของสกิล (ระยะ S2) — 2 = ใช้ถูกจังหวะครบแล้ว แรงขึ้น' }) rank!: number;
}

export class ProgramDto {
  @ApiProperty() source!: string;
  @ApiProperty({ type: [String], description: 'ไวยากรณ์ที่ปลดล็อกแล้ว' }) unlockedFeatures!: string[];
  @ApiProperty({ type: [ProgramSkillDto], description: 'สกิลที่มีทั้งหมด — โปรแกรมเดียวใช้ได้ไม่เกิน skillSlots.slots ชนิด' })
  availableSkills!: ProgramSkillDto[];
  @ApiProperty({ type: SkillSlotsDto }) skillSlots!: SkillSlotsDto;
  @ApiProperty() highestFloorCleared!: number;
}
