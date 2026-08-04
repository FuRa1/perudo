import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomsService } from './rooms.service';

@Module({
  providers: [GameGateway, RoomsService],
})
export class GameModule {}
