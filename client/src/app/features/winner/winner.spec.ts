import { TestBed } from '@angular/core/testing';
import { GamePhase, type MatchState, type Player } from '@shared';
import { GameStore } from '../../core/game-store';
import { Winner } from './winner';

function player(id: string, nickname: string): Player {
  return { id, nickname, isReady: true, diceCount: 5, dice: [], consecutivePureStalls: 0 };
}

function gameOverState(winnerId: string, players: Player[]): MatchState {
  return {
    phase: GamePhase.GAME_OVER,
    roomId: 'room-1',
    players,
    startRoll: null,
    completedStartRoll: null,
    round: null,
    winnerId,
  };
}

function render(playerId: string, winnerId: string, players: Player[]) {
  const store = TestBed.inject(GameStore);
  store.playerId.set(playerId);
  store.matchState.set(gameOverState(winnerId, players));
  const fixture = TestBed.createComponent(Winner);
  fixture.detectChanges();
  return { fixture, nativeElement: fixture.nativeElement as HTMLElement };
}

describe('Winner', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Winner] });
  });

  it("renders the server-provided winner's nickname as the dominant heading", () => {
    const { nativeElement } = render('p2', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
    const heading = nativeElement.querySelector('h1');
    expect(heading?.textContent ?? '').toContain('Alice wins!');
  });

  it('clearly states the match is complete', () => {
    const { nativeElement } = render('p2', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
    expect(nativeElement.textContent ?? '').toContain('Match complete');
  });

  it('shows a congratulatory subtitle for the winner themself', () => {
    const { nativeElement } = render('p1', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
    expect(nativeElement.textContent ?? '').toContain('Congratulations, you won the match.');
  });

  it('shows a closing subtitle naming the winner for a defeated player, not a blank state', () => {
    const { nativeElement } = render('p2', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
    expect(nativeElement.textContent ?? '').toContain('The match is over');
    expect(nativeElement.textContent ?? '').toContain('Alice took the last die.');
  });

  it('falls back to a safe label if the winner is somehow not in the roster', () => {
    const { nativeElement } = render('p2', 'ghost', [player('p2', 'Bob')]);
    expect(nativeElement.textContent ?? '').toContain('Unknown wins!');
  });

  it('renders with no actions — none exist to preserve, so none are added', () => {
    const { nativeElement } = render('p1', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
    expect(nativeElement.querySelectorAll('ion-button, button')).toHaveLength(0);
  });
});
