import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { NoNulCharacter } from './validation';

/** ?page=&limit= — ค่าเริ่มต้น page 1 · limit 20 · สูงสุด 100 (api-conventions.md ข้อ 5) */
export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100000, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page ต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'page ต้องไม่น้อยกว่า 1' })
  @Max(100000, { message: 'page ต้องไม่เกิน 100000' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit ต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'limit ต้องไม่น้อยกว่า 1' })
  @Max(100, { message: 'limit ต้องไม่เกิน 100' })
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/**
 * ?q=&page=&limit= — ตารางที่มีช่องค้นหา (ui-design-system ข้อ 8.2: ทุกตารางต้องมีช่องค้นหา)
 * ตัดช่องว่างหัวท้ายและยุบช่องว่างซ้อน · ว่าง = ไม่กรอง
 * แต่ละ endpoint บอกเองว่า q ค้นในช่องไหน (ดู summary ของ endpoint)
 */
export class SearchPageQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'คำค้นหา ไม่สนตัวพิมพ์เล็ก/ใหญ่ · ว่าง = ทั้งหมด' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') || undefined : value))
  @IsString({ message: 'q ต้องเป็นข้อความ' })
  @MaxLength(100, { message: 'q ยาวได้ไม่เกิน 100 ตัวอักษร' })
  @NoNulCharacter('q')
  q?: string;
}
