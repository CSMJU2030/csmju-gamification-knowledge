import { Module } from '@nestjs/common';
import { GameDataController } from './game-data.controller';

@Module({ controllers: [GameDataController] })
export class GameDataModule {}
