import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type Player, type StateSnapshot } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { VISUAL_ASSETS_CONFIG } from '../../ui/visual-assets/visual-assets.config';
import { Winner } from './winner';

function player(id: string, nickname: string): Player {
  return {
    id,
    nickname,
    isReady: true,
    diceCount: 5,
    dice: [],
    consecutivePureStalls: 0,
    eliminatedInRound: null,
  };
}

function gameOverState(winnerId: string, players: Player[]): StateSnapshot {
  return {
    phase: GamePhase.GAME_OVER,
    roomId: 'room-1',
    players,
    startRoll: null,
    completedStartRoll: null,
    round: null,
    winnerId,
    turnTimer: null,
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

interface FakeSocket {
  leaveMatch: ReturnType<typeof vi.fn>;
}

describe('Winner', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    socket = { leaveMatch: vi.fn() };
    TestBed.configureTestingModule({
      imports: [Winner],
      providers: [{ provide: SocketService, useValue: socket }],
    });
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

  // The only action here is the way out. A rematch/"play again" would need a server intent that
  // does not exist (CLAUDE.md 6.2 lists the full set), so it is still deliberately absent — but
  // leaving *no* action at all made this a dead end: the stored reconnect token outlives the
  // match, so reloading restores the same finished game rather than returning to the entry screen.
  it('offers exactly one action — the way out — and never invents a rematch the server cannot serve', () => {
    const { nativeElement } = render('p1', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
    const actions = nativeElement.querySelectorAll('ion-button, button');
    expect(actions).toHaveLength(1);
    expect(nativeElement.textContent ?? '').not.toMatch(/play again|rematch|start again/i);
  });

  it('leaves the match when that action is used, so the finished game is not restored on reload', () => {
    const { nativeElement } = render('p1', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
    const action = nativeElement.querySelector('.winner__action') as HTMLElement;
    action.dispatchEvent(new Event('click'));
    expect(socket.leaveMatch).toHaveBeenCalled();
  });

  it('gives the winner their own kicker, and everyone else the neutral one', () => {
    const win = render('p1', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
    expect(win.nativeElement.textContent ?? '').toContain('The table is yours');

    const loss = render('p2', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
    expect(loss.nativeElement.textContent ?? '').toContain('Match complete');
    expect(loss.nativeElement.textContent ?? '').not.toContain('The table is yours');
  });

  describe('outcome badge (decor/badge-won.png)', () => {
    it('renders the real badge image, not the CSS placeholder, once configured', () => {
      const { nativeElement } = render('p1', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
      const img = nativeElement.querySelector<HTMLImageElement>('.winner-badge-image');
      expect(img?.src).toContain('/assets/decor/badge-won.png');
      expect(img?.getAttribute('aria-hidden')).toBe('true');
      expect(nativeElement.querySelector('.winner-badge')).toBeNull();
    });

    it('falls back to the CSS dashed-roundel placeholder when no badge asset is configured', () => {
      const original = VISUAL_ASSETS_CONFIG.badgeWon.imageUrl;
      (VISUAL_ASSETS_CONFIG.badgeWon as { imageUrl?: string }).imageUrl = undefined;
      try {
        const { nativeElement } = render('p1', 'p1', [player('p1', 'Alice'), player('p2', 'Bob')]);
        expect(nativeElement.querySelector('.winner-badge')).not.toBeNull();
        expect(nativeElement.querySelector('.winner-badge-image')).toBeNull();
      } finally {
        (VISUAL_ASSETS_CONFIG.badgeWon as { imageUrl?: string }).imageUrl = original;
      }
    });
  });
});
