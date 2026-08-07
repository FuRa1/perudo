import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type MatchState, type Player } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { Lobby } from './lobby';

function player(id: string, nickname: string, isReady: boolean): Player {
  return { id, nickname, isReady, diceCount: 5, dice: [], consecutivePureStalls: 0 };
}

function lobbyState(players: Player[]): MatchState {
  return {
    phase: GamePhase.LOBBY,
    roomId: 'TORTUGA',
    players,
    startRoll: null,
    completedStartRoll: null,
    winnerId: null,
    round: null,
  };
}

interface FakeSocket {
  setReady: ReturnType<typeof vi.fn>;
}

function render(playerId: string, players: Player[]) {
  const store = TestBed.inject(GameStore);
  store.playerId.set(playerId);
  store.matchState.set(lobbyState(players));
  const fixture = TestBed.createComponent(Lobby);
  fixture.detectChanges();
  return { fixture, nativeElement: fixture.nativeElement as HTMLElement };
}

describe('Lobby', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    socket = { setReady: vi.fn() };
    TestBed.configureTestingModule({
      imports: [Lobby],
      providers: [{ provide: SocketService, useValue: socket }],
    });
  });

  it('shows the room code prominently', () => {
    const { nativeElement } = render('p1', [player('p1', 'Alice', false)]);
    expect(nativeElement.textContent ?? '').toContain('TORTUGA');
  });

  it("marks only the local player's row with a (you) tag", () => {
    const { nativeElement } = render('p1', [
      player('p1', 'Alice', false),
      player('p2', 'Bob', false),
    ]);
    const rows = Array.from(nativeElement.querySelectorAll('.lobby__row'));
    const aliceRow = rows.find((r) => (r.textContent ?? '').includes('Alice'));
    const bobRow = rows.find((r) => (r.textContent ?? '').includes('Bob'));
    expect(aliceRow?.textContent ?? '').toContain('(you)');
    expect(bobRow?.textContent ?? '').not.toContain('(you)');
    expect(aliceRow?.className).toContain('lobby__row--me');
    expect(bobRow?.className).not.toContain('lobby__row--me');
  });

  it('shows Ready / Not ready per player, matching server state exactly', () => {
    const { nativeElement } = render('p1', [
      player('p1', 'Alice', true),
      player('p2', 'Bob', false),
    ]);
    const rows = Array.from(nativeElement.querySelectorAll('.lobby__row'));
    const aliceRow = rows.find((r) => (r.textContent ?? '').includes('Alice'));
    const bobRow = rows.find((r) => (r.textContent ?? '').includes('Bob'));
    expect(aliceRow?.textContent ?? '').toContain('Ready');
    expect(bobRow?.textContent ?? '').toContain('Not ready');
  });

  it('explains that the match begins once every player is ready, with a live count', () => {
    const { nativeElement } = render('p1', [
      player('p1', 'Alice', true),
      player('p2', 'Bob', false),
      player('p3', 'Cara', false),
    ]);
    expect(nativeElement.textContent ?? '').toContain('1 of 3 ready');
  });

  it('shows a distinct all-ready message once every player is ready', () => {
    const { nativeElement } = render('p1', [
      player('p1', 'Alice', true),
      player('p2', 'Bob', true),
    ]);
    expect(nativeElement.textContent ?? '').toContain('Everyone is ready');
  });

  it("toggles ready to true when I'm not ready yet", () => {
    const { nativeElement } = render('p1', [player('p1', 'Alice', false)]);
    const button = nativeElement.querySelector('ion-button');
    expect(button?.textContent ?? '').toContain("I'm ready");
    button?.dispatchEvent(new Event('click'));
    expect(socket.setReady).toHaveBeenCalledWith(true);
  });

  it('toggles ready to false when I am already ready', () => {
    const { nativeElement } = render('p1', [player('p1', 'Alice', true)]);
    const button = nativeElement.querySelector('ion-button');
    expect(button?.textContent ?? '').toContain('Cancel ready');
    button?.dispatchEvent(new Event('click'));
    expect(socket.setReady).toHaveBeenCalledWith(false);
  });

  it('renders every player in a 12-player room without dropping anyone', () => {
    const players = Array.from({ length: 12 }, (_, i) =>
      player(`p${i}`, `Player${i}`, i % 2 === 0),
    );
    const { nativeElement } = render('p0', players);
    expect(nativeElement.querySelectorAll('.lobby__row')).toHaveLength(12);
  });

  // Design QA Task 6, finding 2: the roster grid used to pin real cards to a ~200px floor even
  // with only 2-3 players (auto-fill reserves tracks for empty columns too), and the "(you)" tag
  // + ready badge could be swallowed by the same truncating span as the nickname. jsdom doesn't
  // run a real CSS Grid layout algorithm, so the auto-fill -> auto-fit switch itself (and actual
  // card widths) is verified live in a real browser instead (Playwright, at 2p and 12p) — these
  // tests cover the structural DOM contract that has to hold regardless of viewport.
  describe('roster layout contract (Design QA Task 6)', () => {
    it('keeps the "(you)" tag and the ready badge as separate elements from the truncated nickname span, never nested inside it', () => {
      const { nativeElement } = render('p1', [player('p1', 'Alice', false)]);
      const row = nativeElement.querySelector('.lobby__row') as HTMLElement;
      const nameSpan = row.querySelector('.lobby__name') as HTMLElement;
      const youTag = row.querySelector('.lobby__you-tag') as HTMLElement;
      const badge = row.querySelector('ion-badge') as HTMLElement;

      expect(nameSpan.className).toContain('truncate');
      // The truncated span holds only the nickname text — "(you)" must never be inside it, or it
      // would be silently clipped along with a long nickname.
      expect(nameSpan.textContent?.trim()).toBe('Alice');
      expect(nameSpan.contains(youTag)).toBe(false);
      expect(nameSpan.contains(badge)).toBe(false);

      // Both must be flex-none siblings so they never shrink/truncate under space pressure.
      expect(youTag.className).toContain('flex-none');
      expect(badge.className).toContain('flex-none');
    });

    it('keeps local-player identity and ready state fully readable even with a very long nickname', () => {
      const longName = 'ACaptainWithAnExtraordinarilyLongPirateNickname';
      const { nativeElement } = render('p1', [player('p1', longName, true)]);
      const row = nativeElement.querySelector('.lobby__row') as HTMLElement;
      const youTag = row.querySelector('.lobby__you-tag');
      const badge = row.querySelector('ion-badge');
      expect(youTag?.textContent ?? '').toContain('(you)');
      expect(badge?.textContent ?? '').toContain('Ready');
    });

    it('keeps every "(you)" tag and ready badge present and un-truncated across a full 12-player room', () => {
      const players = Array.from({ length: 12 }, (_, i) =>
        player(`p${i}`, `Player${i}`, i % 2 === 0),
      );
      const { nativeElement } = render('p0', players);
      const rows = Array.from(nativeElement.querySelectorAll('.lobby__row'));
      expect(rows).toHaveLength(12);

      const ownRow = rows.find((r) => r.className.includes('lobby__row--me'));
      expect(ownRow?.querySelector('.lobby__you-tag')?.textContent ?? '').toContain('(you)');

      for (const row of rows) {
        const badge = row.querySelector('ion-badge');
        expect(badge?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      }
    });
  });
});
