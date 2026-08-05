import { TestBed } from '@angular/core/testing';
import type { ServerEvent } from '@shared';
import { GameStore } from './game-store';

describe('GameStore — opening-roll vs hand-roll animation triggers stay separate', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('START_ROLL_ROLLED marks openingRollingPlayerIds only — never handRollingPlayerIds', () => {
    const store = TestBed.inject(GameStore);
    const events: ServerEvent[] = [{ type: 'START_ROLL_ROLLED', playerId: 'p1', value: 4 }];

    store.applyEvents(events);

    expect(store.openingRollingPlayerIds().has('p1')).toBe(true);
    expect(store.handRollingPlayerIds().has('p1')).toBe(false);
  });

  it('PLAYER_ROLLED_HAND marks handRollingPlayerIds only — never openingRollingPlayerIds', () => {
    const store = TestBed.inject(GameStore);
    const events: ServerEvent[] = [{ type: 'PLAYER_ROLLED_HAND', playerId: 'p1' }];

    store.applyEvents(events);

    expect(store.handRollingPlayerIds().has('p1')).toBe(true);
    expect(store.openingRollingPlayerIds().has('p1')).toBe(false);
  });

  it('an opening roll for one player never marks a different player as hand-rolling', () => {
    const store = TestBed.inject(GameStore);
    store.applyEvents([{ type: 'START_ROLL_ROLLED', playerId: 'p1', value: 6 }]);
    store.applyEvents([{ type: 'PLAYER_ROLLED_HAND', playerId: 'p2' }]);

    expect(store.openingRollingPlayerIds()).toEqual(new Set(['p1']));
    expect(store.handRollingPlayerIds()).toEqual(new Set(['p2']));
  });
});
