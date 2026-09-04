import { TestBed } from '@angular/core/testing';
import { GamePhase, type StateSnapshot } from '@shared';
import { GameStore } from './game-store';
import { loadRequestedFixture } from './fixture-loader';

function snapshot(): StateSnapshot {
  return {
    phase: GamePhase.LOBBY,
    roomId: 'room-1',
    players: [
      {
        id: 'p1',
        nickname: 'Anne',
        isReady: false,
        diceCount: 5,
        dice: [],
        consecutivePureStalls: 0,
      },
    ],
    startRoll: null,
    completedStartRoll: null,
    winnerId: null,
    round: null,
    turnTimer: null,
  };
}

/** Sets `window.location.search` for the duration of one test, restoring it afterward, via
 * `history.pushState` (the standard jsdom-safe way to change the URL — `window.location` itself
 * isn't freely reassignable/spreadable). The loader reads the URL directly (matching
 * SocketService's own `?serverUrl=...` pattern) rather than through Angular's router (this app
 * doesn't use routing, app.routes.ts is empty). */
async function withQuery(search: string, run: () => Promise<void>): Promise<void> {
  const original = window.location.pathname + window.location.search;
  history.pushState({}, '', `/${search}`);
  try {
    await run();
  } finally {
    history.pushState({}, '', original);
  }
}

describe('loadRequestedFixture', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('is a no-op with no ?fixture= param — never calls fetch, never touches GameStore', async () => {
    await withQuery('', async () => {
      await TestBed.runInInjectionContext(() => loadRequestedFixture());
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const store = TestBed.inject(GameStore);
    expect(store.playerId()).toBeNull();
    expect(store.matchState()).toBeNull();
  });

  it('loads a valid fixture: fetches by name, applies events before state, marks connected', async () => {
    const fixture = {
      viewerPlayerId: 'p1',
      events: [{ type: 'PLAYER_ROLLED_HAND', playerId: 'p1' }],
      snapshot: snapshot(),
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));

    await withQuery('?fixture=lobby-2p', async () => {
      await TestBed.runInInjectionContext(() => loadRequestedFixture());
    });

    expect(fetchMock).toHaveBeenCalledWith('/assets/fixtures/lobby-2p.json');
    const store = TestBed.inject(GameStore);
    expect(store.playerId()).toBe('p1');
    expect(store.matchState()).toEqual(fixture.snapshot);
    expect(store.connected()).toBe(true);
  });

  it('a 404 leaves the store untouched instead of throwing', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await withQuery('?fixture=missing', async () => {
      await expect(
        TestBed.runInInjectionContext(() => loadRequestedFixture()),
      ).resolves.toBeUndefined();
    });
    const store = TestBed.inject(GameStore);
    expect(store.playerId()).toBeNull();
  });

  it('a malformed fixture shape leaves the store untouched instead of throwing', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ oops: true }), { status: 200 }));
    await withQuery('?fixture=broken', async () => {
      await expect(
        TestBed.runInInjectionContext(() => loadRequestedFixture()),
      ).resolves.toBeUndefined();
    });
    const store = TestBed.inject(GameStore);
    expect(store.playerId()).toBeNull();
  });
});
