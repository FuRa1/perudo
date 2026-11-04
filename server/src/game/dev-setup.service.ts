import { Injectable, Logger } from '@nestjs/common';
import { RULES_CONFIG } from '@shared';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * `perudo.config.json`'s optional `devStartingDice` section — a quick-playtest setup, never a
 * rules change:
 *
 *   "devStartingDice": { "default": 2, "byNickname": { "NeverLose": 5 } }
 *
 * Every joining player starts with `default` dice unless their nickname is listed. Values are
 * clamped to 1..RULES_CONFIG.startingDicePerPlayer. Absent (the normal case) → standard rules.
 */
interface RawDevStartingDice {
  default?: unknown;
  byNickname?: unknown;
}

function clampDice(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }
  return Math.min(Math.max(value, 1), RULES_CONFIG.startingDicePerPlayer);
}

@Injectable()
export class DevSetupService {
  private readonly logger = new Logger(DevSetupService.name);
  private defaultDice: number | null = null;
  private readonly byNickname = new Map<string, number>();

  constructor() {
    this.load(join(process.cwd(), 'perudo.config.json'));
  }

  /** The engine's optional `startingDiceFor` dependency, or undefined when not configured. */
  get startingDiceFor(): ((nickname: string) => number) | undefined {
    if (this.defaultDice === null && this.byNickname.size === 0) {
      return undefined;
    }
    const fallback = this.defaultDice ?? RULES_CONFIG.startingDicePerPlayer;
    return (nickname) => this.byNickname.get(nickname) ?? fallback;
  }

  load(configFile: string): void {
    if (!existsSync(configFile)) {
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as {
        devStartingDice?: RawDevStartingDice;
      };
      this.apply(parsed.devStartingDice);
    } catch (error: unknown) {
      this.logger.error(`Ignoring devStartingDice: could not read ${configFile}`, error);
    }
  }

  private apply(raw: RawDevStartingDice | undefined): void {
    if (!raw) {
      return;
    }
    this.defaultDice = clampDice(raw.default);
    if (raw.byNickname && typeof raw.byNickname === 'object') {
      for (const [nickname, value] of Object.entries(raw.byNickname)) {
        const dice = clampDice(value);
        if (dice !== null) {
          this.byNickname.set(nickname, dice);
        }
      }
    }
    if (this.startingDiceFor) {
      this.logger.warn(
        `DEV SETUP ACTIVE: players start with ${this.defaultDice ?? RULES_CONFIG.startingDicePerPlayer} dice` +
          (this.byNickname.size ? `, overrides: ${JSON.stringify([...this.byNickname])}` : ''),
      );
    }
  }
}
