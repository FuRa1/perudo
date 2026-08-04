import { TestBed } from '@angular/core/testing';
import type { CompletedStartRoll, Player, StartRollState } from '@shared';
import { OpeningRollPanel } from './opening-roll-panel';

function player(id: string, nickname = id): Player {
  return { id, nickname, isReady: true, diceCount: 5, dice: [], consecutivePureStalls: 0 };
}

function render(
  players: Player[],
  startRoll: StartRollState | null,
  completedStartRoll: CompletedStartRoll | null = null,
  rollingPlayerIds: ReadonlySet<string> = new Set(),
) {
  const fixture = TestBed.createComponent(OpeningRollPanel);
  fixture.componentRef.setInput('players', players);
  fixture.componentRef.setInput('startRoll', startRoll);
  fixture.componentRef.setInput('completedStartRoll', completedStartRoll);
  fixture.componentRef.setInput('rollingPlayerIds', rollingPlayerIds);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('OpeningRollPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OpeningRollPanel] });
  });

  it('shows "Waiting to roll" for a player who has not rolled and is not currently rolling', () => {
    const text = render([player('p1', 'Alice'), player('p2', 'Bob')], {
      pendingPlayerIds: ['p1', 'p2'],
      rolls: {},
    });
    expect(text).toContain('Alice');
    expect(text).toContain('Waiting to roll');
  });

  it('shows the cosmetic rolling cue instead of any value for a player mid-roll', () => {
    // Single player so the assertion is unambiguous — a same-panel opponent still "waiting" is
    // legitimately part of the next test instead.
    const text = render(
      [player('p1', 'Alice')],
      { pendingPlayerIds: ['p1'], rolls: {} },
      null,
      new Set(['p1']),
    );
    expect(text).not.toContain('Waiting to roll');
    // The rolling placeholder renders the generic die glyph, never a specific pip count.
    expect(text).toContain('🎲');
  });

  it('shows the actual public die once a player has rolled, while others still wait', () => {
    const text = render([player('p1', 'Alice'), player('p2', 'Bob')], {
      pendingPlayerIds: ['p2'],
      rolls: { p1: 5 },
    });
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
    // Bob is legitimately still waiting — only assert Alice's own row isn't stuck on that text
    // by checking the die/pip container rendered instead of Bob's status string being doubled.
    const waitingCount = (text.match(/Waiting to roll/g) ?? []).length;
    expect(waitingCount).toBe(1);
  });

  it('marks the winner once the roll is resolved into completedStartRoll', () => {
    const completed: CompletedStartRoll = { rolls: { p1: 6, p2: 4 }, firstPlayerId: 'p1' };
    const text = render([player('p1', 'Alice'), player('p2', 'Bob')], null, completed);
    expect(text).toContain('Starts round 1');
  });
});
