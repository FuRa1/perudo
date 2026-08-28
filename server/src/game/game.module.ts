import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomsService } from './rooms.service';
import { TurnTimerService } from './turn-timer.service';

@Module({
  providers: [GameGateway, RoomsService, TurnTimerService],
})
export class GameModule {}
