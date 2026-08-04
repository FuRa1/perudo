/** A single die's face value. 1 is the ace — wild by default (5.4), fixed and non-wild during a special round (5.5). */
export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Source of dice rolls, injected into GameEngine (CLAUDE.md 6.4). Never called directly from
 * game logic — only through this interface, so the engine stays deterministic under test.
 * Production implementations (e.g. crypto.randomInt) live outside /shared, in /server.
 */
export interface DiceRoller {
  roll(): DiceValue;
}
