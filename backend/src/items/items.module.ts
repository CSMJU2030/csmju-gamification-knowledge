import { Module } from '@nestjs/common';
import { ItemUpgradesController } from './item-upgrades.controller';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  controllers: [ItemsController, ItemUpgradesController],
  providers: [ItemsService],
})
export class ItemsModule {}
