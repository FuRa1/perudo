import { Injectable } from '@nestjs/common';
import { RULES_CONFIG } from '@shared';

export interface ServerStatus {
  name: string;
  players: { min: number; max: number };
}

@Injectable()
export class AppService {
  getStatus(): ServerStatus {
    return {
      name: 'perudo-server',
      players: RULES_CONFIG.players,
    };
  }
}
