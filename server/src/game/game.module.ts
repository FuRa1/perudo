import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomsService } from './rooms.service';
import { DevSetupService } from './dev-setup.service';
import { TimerConfigService } from './timer-config.service';
import { TurnTimerService } from './turn-timer.service';

@Module({
  providers: [GameGateway, RoomsService, TurnTimerService, TimerConfigService, DevSetupService],
})
export class GameModule {}
