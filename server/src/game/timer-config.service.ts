import { Injectable, Logger } from '@nestjs/common';
import { RULES_CONFIG } from '@shared';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface TimerConfig {
  quietPhaseEndMs: number;
  audiblePhaseEndMs: number;
  baseTurnMs: number;
  personalBankMs: number;
  specialRoundBonusTimerMs: number;
  reconnectWaitWindowMs: number;
  enabled: boolean;
}

interface RawTimerConfigFile {
  turnTimer?: {
    quietPhaseEndMs?: number;
    audiblePhaseEndMs?: number;
    baseTurnMs?: number;
    personalBankMs?: number;
  };
  specialRoundBonusTimerMs?: number;
  reconnectWaitWindowMs?: number;
  enabled?: boolean;
}

@Injectable()
export class TimerConfigService {
  private readonly logger = new Logger(TimerConfigService.name);
  private readonly config: TimerConfig = {
    ...RULES_CONFIG.turnTimer,
    specialRoundBonusTimerMs: RULES_CONFIG.specialRoundBonusTimerMs,
    reconnectWaitWindowMs: RULES_CONFIG.reconnectWaitWindowMs,
    enabled: true,
  };

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      const configFile = join(process.cwd(), 'perudo.config.json');
      if (!existsSync(configFile)) {
        this.logger.log(
          'No perudo.config.json found, using default timer settings with timing enabled',
        );
        return;
      }
      const configContent = readFileSync(configFile, 'utf8');
      const userConfig = JSON.parse(configContent) as RawTimerConfigFile;

      if (userConfig.turnTimer) {
        this.config.quietPhaseEndMs =
          userConfig.turnTimer.quietPhaseEndMs ?? this.config.quietPhaseEndMs;
        this.config.audiblePhaseEndMs =
          userConfig.turnTimer.audiblePhaseEndMs ?? this.config.audiblePhaseEndMs;
        this.config.baseTurnMs = userConfig.turnTimer.baseTurnMs ?? this.config.baseTurnMs;
        this.config.personalBankMs =
          userConfig.turnTimer.personalBankMs ?? this.config.personalBankMs;
      }

      if (userConfig.specialRoundBonusTimerMs !== undefined) {
        this.config.specialRoundBonusTimerMs = userConfig.specialRoundBonusTimerMs;
      }

      if (userConfig.reconnectWaitWindowMs !== undefined) {
        this.config.reconnectWaitWindowMs = userConfig.reconnectWaitWindowMs;
      }

      if (userConfig.enabled !== undefined) {
        this.config.enabled = userConfig.enabled;
      }

      this.logger.log('Custom timer configuration loaded successfully');
    } catch (error) {
      this.logger.warn('Failed to load custom timer configuration, using defaults', error);
    }
  }

  getTimerConfig(): TimerConfig {
    return { ...this.config };
  }

  isTimerEnabled(): boolean {
    return this.config.enabled;
  }
}
