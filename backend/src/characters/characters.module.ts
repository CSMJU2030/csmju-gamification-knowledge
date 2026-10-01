import { Module } from '@nestjs/common';
import { CoreHubModule } from '../core-hub/core-hub.module';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';

@Module({
  imports: [CoreHubModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
