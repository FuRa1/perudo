import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomsService } from './rooms.service';
import { TimerConfigService } from './timer-config.service';
import { TurnTimerService } from './turn-timer.service';

@Module({
  providers: [GameGateway, RoomsService, TurnTimerService, TimerConfigService],
})
export class GameModule {}
