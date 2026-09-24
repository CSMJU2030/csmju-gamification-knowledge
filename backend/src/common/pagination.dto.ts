import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

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
