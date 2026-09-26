import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ example: 'csmju-gamification-knowledge' })
  service!: string;
}
