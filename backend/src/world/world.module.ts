import { Module } from '@nestjs/common';
import { DuelService } from './duel.service';
import { RegionRunsController } from './region-runs.controller';
import { RegionRunsService } from './region-runs.service';
import { RegionsController } from './regions.controller';

@Module({
  controllers: [RegionsController, RegionRunsController],
  providers: [RegionRunsService, DuelService],
  exports: [RegionRunsService, DuelService],
})
export class WorldModule {}
