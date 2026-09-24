import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { MAX_PROGRAM_CHARS } from '../game/game-rules';

export class UpdateProgramDto {
  @ApiProperty({ description: 'โปรแกรม BloxCode (Python subset) — ต้องมี def turn():', maxLength: MAX_PROGRAM_CHARS })
  @IsString({ message: 'source ต้องเป็นข้อความ' })
  source!: string;
}

export class ProgramSkillDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() mpCost!: number;
  @ApiProperty() aoe!: boolean;
}

export class ProgramDto {
  @ApiProperty() source!: string;
  @ApiProperty({ type: [String], description: 'ไวยากรณ์ที่ปลดล็อกแล้ว' }) unlockedFeatures!: string[];
  @ApiProperty({ type: [ProgramSkillDto] }) availableSkills!: ProgramSkillDto[];
  @ApiProperty() highestFloorCleared!: number;
}
