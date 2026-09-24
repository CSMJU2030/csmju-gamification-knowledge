import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsUUID } from 'class-validator';
import { ItemDto } from '../characters/character.dto';

export class UpdateItemDto {
  @ApiProperty({ description: 'true = สวมใส่ (ของเดิมในช่องเดียวกันถูกถอดให้) · false = ถอด' })
  @IsBoolean({ message: 'equipped ต้องเป็น true หรือ false' })
  equipped!: boolean;
}

export class SalvagedItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: [true] }) deleted!: true;
  @ApiProperty({ description: 'วัสดุที่ได้จากการย่อยชิ้นนี้' }) materialsGained!: number;
  @ApiProperty({ description: 'วัสดุคงเหลือหลังย่อย' }) materials!: number;
}

export class CreateItemUpgradeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'itemId ต้องเป็น UUID v4' })
  itemId!: string;
}

export class ItemUpgradeDto {
  @ApiProperty({ type: ItemDto }) item!: ItemDto;
  @ApiProperty() goldSpent!: number;
  @ApiProperty() materialsSpent!: number;
  @ApiProperty({ description: 'ทองคงเหลือ' }) gold!: number;
  @ApiProperty({ description: 'วัสดุคงเหลือ' }) materials!: number;
}
