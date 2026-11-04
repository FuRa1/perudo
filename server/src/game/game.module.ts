import { Module } from '@nestjs/common';
import { CryptoDiceRoller, DICE_ROLLER } from './crypto-dice-roller';
import { GameGateway } from './game.gateway';
import { RoomsService } from './rooms.service';

@Module({
  providers: [GameGateway, RoomsService, { provide: DICE_ROLLER, useClass: CryptoDiceRoller }],
  exports: [RoomsService],
})
export class GameModule {}
