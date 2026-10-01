import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_PROGRAM_CHARS } from '../game/game-rules';
import { NoNulCharacter, OptionalButNotNull } from '../common/validation';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateChallengeDto {
  @ApiProperty({ example: 'ตั้งการ์ดเมื่อถูกหมายหัว', maxLength: 120 })
  @Transform(trim)
  @IsString({ message: 'title ต้องเป็นข้อความ' })
  @IsNotEmpty({ message: 'title ห้ามว่าง' })
  @MaxLength(120, { message: 'title ยาวได้ไม่เกิน 120 ตัวอักษร' })
  @NoNulCharacter('title')
  title!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @OptionalButNotNull()
  @IsString({ message: 'description ต้องเป็นข้อความ' })
  @MaxLength(4000, { message: 'description ยาวได้ไม่เกิน 4000 ตัวอักษร' })
  @NoNulCharacter('description')
  description?: string;

  @ApiPropertyOptional({ description: 'โปรแกรมตั้งต้นให้ผู้เล่น — ต้อง parse ผ่าน · เว้นไว้ = โปรแกรมพื้นฐาน', maxLength: MAX_PROGRAM_CHARS })
  @OptionalButNotNull()
  @IsString({ message: 'starterSource ต้องเป็นข้อความ' })
  @MaxLength(MAX_PROGRAM_CHARS, { message: `starterSource ยาวได้ไม่เกิน ${MAX_PROGRAM_CHARS} ตัวอักษร` })
  @NoNulCharacter('starterSource')
  starterSource?: string;

  @ApiPropertyOptional({ type: String, example: 'frostland', nullable: true, description: 'ภูมิภาคที่โจทย์นี้ผูกด้วย (ถ้ามี)' })
  @IsOptional()
  @IsString({ message: 'regionId ต้องเป็นข้อความ' })
  @MaxLength(64, { message: 'regionId ยาวเกินไป' })
  @NoNulCharacter('regionId')
  regionId?: string | null;
}

/**
 * แก้บางช่อง — เขียนเองแทน PartialType เพราะ PartialType ใส่ @IsOptional ให้ทุกช่อง
 * ซึ่งปล่อย null ผ่าน · ที่นี่มีแค่ regionId ที่ส่ง null ได้ (= เลิกผูกกับภูมิภาค)
 */
export class UpdateChallengeDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @OptionalButNotNull()
  @Transform(trim)
  @IsString({ message: 'title ต้องเป็นข้อความ' })
  @IsNotEmpty({ message: 'title ห้ามว่าง' })
  @MaxLength(120, { message: 'title ยาวได้ไม่เกิน 120 ตัวอักษร' })
  @NoNulCharacter('title')
  title?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @OptionalButNotNull()
  @IsString({ message: 'description ต้องเป็นข้อความ' })
  @MaxLength(4000, { message: 'description ยาวได้ไม่เกิน 4000 ตัวอักษร' })
  @NoNulCharacter('description')
  description?: string;

  @ApiPropertyOptional({ maxLength: MAX_PROGRAM_CHARS })
  @OptionalButNotNull()
  @IsString({ message: 'starterSource ต้องเป็นข้อความ' })
  @MaxLength(MAX_PROGRAM_CHARS, { message: `starterSource ยาวได้ไม่เกิน ${MAX_PROGRAM_CHARS} ตัวอักษร` })
  @NoNulCharacter('starterSource')
  starterSource?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'null = เลิกผูกกับภูมิภาค' })
  @IsOptional()
  @IsString({ message: 'regionId ต้องเป็นข้อความ' })
  @MaxLength(64, { message: 'regionId ยาวเกินไป' })
  @NoNulCharacter('regionId')
  regionId?: string | null;
}

export class ChallengeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'core_user_id ของผู้สร้าง' }) coreUserId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() starterSource!: string;
  @ApiProperty({ type: String, nullable: true, description: 'ภูมิภาคที่ผูก · null = ไม่ผูก' }) regionId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
