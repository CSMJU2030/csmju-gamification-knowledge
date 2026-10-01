import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BattlesModule } from './battles/battles.module';
import { ChallengesModule } from './challenges/challenges.module';
import { CharactersModule } from './characters/characters.module';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { GameDataModule } from './game-data/game-data.module';
import { HealthController } from './health/health.controller';
import { ItemsModule } from './items/items.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgramsModule } from './programs/programs.module';
import { WorldModule } from './world/world.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv, cache: true }),
    PrismaModule,
    AuthModule,
    CharactersModule,
    ProgramsModule,
    ItemsModule,
    WorldModule,
    BattlesModule,
    GameDataModule,
    ChallengesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
