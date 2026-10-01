import { Module } from '@nestjs/common';
import { WorldModule } from '../world/world.module';
import { BattlePersistenceService } from './battle-persistence.service';
import { BattlesController, TowerProgressController } from './battles.controller';
import { BattlesService } from './battles.service';

@Module({
  imports: [WorldModule],
  controllers: [BattlesController, TowerProgressController],
  providers: [BattlesService, BattlePersistenceService],
})
export class BattlesModule {}
