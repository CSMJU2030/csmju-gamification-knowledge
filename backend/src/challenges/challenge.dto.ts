import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateChallengeDto {
  @ApiProperty({ example: 'ตั้งการ์ดเมื่อถูกหมายหัว', maxLength: 120 })
  @IsString({ message: 'title ต้องเป็นข้อความ' })
  @IsNotEmpty({ message: 'title ห้ามว่าง' })
  @MaxLength(120, { message: 'title ยาวได้ไม่เกิน 120 ตัวอักษร' })
  title!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString({ message: 'description ต้องเป็นข้อความ' })
  @MaxLength(4000, { message: 'description ยาวได้ไม่เกิน 4000 ตัวอักษร' })
  description?: string;

  @ApiPropertyOptional({ description: 'โปรแกรมตั้งต้นให้ผู้เล่น — ต้อง parse ผ่าน · เว้นไว้ = โปรแกรมพื้นฐาน' })
  @IsOptional()
  @IsString({ message: 'starterSource ต้องเป็นข้อความ' })
  starterSource?: string;

  @ApiPropertyOptional({ example: 'frostland', description: 'ภูมิภาคที่โจทย์นี้ผูกด้วย (ถ้ามี)' })
  @IsOptional()
  @IsString({ message: 'regionId ต้องเป็นข้อความ' })
  regionId?: string;
}

export class UpdateChallengeDto extends PartialType(CreateChallengeDto) {}

export class ChallengeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'core_user_id ของผู้สร้าง' }) coreUserId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() starterSource!: string;
  @ApiPropertyOptional({ nullable: true }) regionId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
