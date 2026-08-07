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
});
