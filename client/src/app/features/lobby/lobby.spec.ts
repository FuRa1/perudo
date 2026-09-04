import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, RULES_CONFIG, type Player, type StateSnapshot } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { Lobby } from './lobby';

function player(id: string, nickname: string, isReady: boolean): Player {
  return { id, nickname, isReady, diceCount: 5, dice: [], consecutivePureStalls: 0 };
}

function lobbyState(players: Player[]): StateSnapshot {
  return {
    phase: GamePhase.LOBBY,
    roomId: 'TORTUGA',
    players,
    startRoll: null,
    completedStartRoll: null,
    winnerId: null,
    round: null,
    turnTimer: null,
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
  const nativeElement = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    nativeElement,
    readyButton: () => nativeElement.querySelector('.lobby__ready-button') as HTMLElement,
    shareButton: () => nativeElement.querySelector('.lobby__code-share') as HTMLElement,
  };
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

  it('does not render a manual start-match button or any table-browser content', () => {
    const { nativeElement } = render('p1', [player('p1', 'Alice', false)]);
    const text = nativeElement.textContent ?? '';
    expect(text).not.toMatch(/start match|start the match/i);
    expect(text).not.toMatch(/watch instead|tables are lit|seats free/i);
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

  it('shows how full the table is against the configured max, and how many are ready', () => {
    const { nativeElement } = render('p1', [
      player('p1', 'Alice', true),
      player('p2', 'Bob', false),
      player('p3', 'Cara', false),
    ]);
    expect(nativeElement.textContent ?? '').toContain(`3 of ${RULES_CONFIG.players.max} · 1 ready`);
  });

  it('shows a distinct all-ready message once every player is ready', () => {
    const { nativeElement } = render('p1', [
      player('p1', 'Alice', true),
      player('p2', 'Bob', true),
    ]);
    expect(nativeElement.textContent ?? '').toContain('Everyone is ready');
  });

  it('does not show the all-ready message while at least one player is not ready', () => {
    const { nativeElement } = render('p1', [
      player('p1', 'Alice', true),
      player('p2', 'Bob', false),
    ]);
    expect(nativeElement.textContent ?? '').not.toContain('Everyone is ready');
  });

  it("toggles ready to true when I'm not ready yet", () => {
    const { readyButton } = render('p1', [player('p1', 'Alice', false)]);
    expect(readyButton().textContent ?? '').toContain("I'm ready");
    readyButton().dispatchEvent(new Event('click'));
    expect(socket.setReady).toHaveBeenCalledWith(true);
  });

  it('toggles ready to false when I am already ready', () => {
    const { readyButton } = render('p1', [player('p1', 'Alice', true)]);
    expect(readyButton().textContent ?? '').toContain('Cancel ready');
    readyButton().dispatchEvent(new Event('click'));
    expect(socket.setReady).toHaveBeenCalledWith(false);
  });

  it('shows the ready action as primary (solid) when not ready and quiet (outline) once ready (Design QA audit, finding 8)', () => {
    const notReady = render('p1', [player('p1', 'Alice', false)]);
    expect((notReady.readyButton() as unknown as { fill: string }).fill).toBe('solid');

    const ready = render('p1', [player('p1', 'Alice', true)]);
    expect((ready.readyButton() as unknown as { fill: string }).fill).toBe('outline');
  });

  it('states the minimum-player rule beneath the ready action, sourced from the shared rules config', () => {
    const { nativeElement } = render('p1', [player('p1', 'Alice', false)]);
    const caption = nativeElement.querySelector('.lobby__ready-caption');
    expect((caption?.textContent ?? '').trim()).toBe(
      `Needs ${RULES_CONFIG.players.min} players · starts when all are ready`,
    );
  });

  it('does not render a manual Start-match button, only Share invite and the ready action', () => {
    const { nativeElement } = render('p1', [player('p1', 'Alice', false)]);
    const buttons = Array.from(nativeElement.querySelectorAll('ion-button'));
    expect(buttons).toHaveLength(2);
    expect(buttons.some((b) => /start match/i.test(b.textContent ?? ''))).toBe(false);
  });

  describe('host marker', () => {
    it('shows Host as text on the first-joined player, and not on later joiners', () => {
      const { nativeElement } = render('p1', [
        player('p1', 'Alice', false),
        player('p2', 'Bob', false),
      ]);
      const rows = Array.from(nativeElement.querySelectorAll('.lobby__row'));
      const aliceRow = rows.find((r) => (r.textContent ?? '').includes('Alice'));
      const bobRow = rows.find((r) => (r.textContent ?? '').includes('Bob'));
      expect(aliceRow?.querySelector('.lobby__host-tag')?.textContent?.trim()).toBe('Host');
      expect(bobRow?.querySelector('.lobby__host-tag')).toBeNull();
    });

    it('shows Host correctly from a guest perspective too (same server state, not local identity)', () => {
      const { nativeElement } = render('p2', [
        player('p1', 'Alice', false),
        player('p2', 'Bob', false),
      ]);
      const rows = Array.from(nativeElement.querySelectorAll('.lobby__row'));
      const aliceRow = rows.find((r) => (r.textContent ?? '').includes('Alice'));
      expect(aliceRow?.querySelector('.lobby__host-tag')?.textContent?.trim()).toBe('Host');
    });
  });

  describe('open-seat placeholders', () => {
    // Only the first few open seats are drawn as rows; the rest are summarised. At the 12-player
    // max an empty room would otherwise be ten identical dashed rows, burying the primary
    // "I'm ready" action a full screen below the fold.
    it('draws only the first few open seats as rows, starting after the seated players', () => {
      const { nativeElement } = render('p1', [
        player('p1', 'Alice', false),
        player('p2', 'Bob', false),
      ]);
      const openSeats = nativeElement.querySelectorAll('.lobby__seat--open');
      expect(openSeats.length).toBeLessThan(RULES_CONFIG.players.max - 2);
      expect(openSeats[0].textContent ?? '').toContain('Seat 3');
    });

    it('summarises the open seats it did not draw, so the real remaining capacity is still stated', () => {
      const { nativeElement } = render('p1', [
        player('p1', 'Alice', false),
        player('p2', 'Bob', false),
      ]);
      const drawn = nativeElement.querySelectorAll('.lobby__seat--open').length;
      const summary = nativeElement.querySelector('.lobby__seat--more');
      expect(summary?.textContent ?? '').toContain(
        `${RULES_CONFIG.players.max - 2 - drawn} more seats open`,
      );
    });

    it('renders no summary line when every open seat is already drawn', () => {
      const players = Array.from({ length: RULES_CONFIG.players.max - 1 }, (_, i) =>
        player(`p${i}`, `Player${i}`, false),
      );
      const { nativeElement } = render('p0', players);
      expect(nativeElement.querySelectorAll('.lobby__seat--open')).toHaveLength(1);
      expect(nativeElement.querySelector('.lobby__seat--more')).toBeNull();
    });

    it('renders no placeholders once the table is at max capacity', () => {
      const players = Array.from({ length: RULES_CONFIG.players.max }, (_, i) =>
        player(`p${i}`, `Player${i}`, false),
      );
      const { nativeElement } = render('p0', players);
      expect(nativeElement.querySelectorAll('.lobby__seat--open')).toHaveLength(0);
    });
  });

  describe('room-code copy control', () => {
    /** jsdom has no real Clipboard implementation — stub the one method copyRoomCode actually
     * calls. `configurable: true` lets each test replace it (e.g. to simulate a rejection)
     * without leaking between tests. */
    function stubClipboard(writeText: ReturnType<typeof vi.fn>): void {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
        writable: true,
      });
    }

    function copyButton(nativeElement: HTMLElement): HTMLButtonElement {
      return nativeElement.querySelector('.lobby__room-code') as HTMLButtonElement;
    }

    it('invokes the clipboard API with the actual room code on a genuine click, not on load', () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      render('p1', [player('p1', 'Alice', false)]);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('copies the real room code when clicked', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      const { nativeElement, fixture } = render('p1', [player('p1', 'Alice', false)]);
      copyButton(nativeElement).click();
      await Promise.resolve();
      fixture.detectChanges();
      expect(writeText).toHaveBeenCalledWith('TORTUGA');
    });

    it('announces success through the polite live region without claiming it before the write resolves', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      const { nativeElement, fixture } = render('p1', [player('p1', 'Alice', false)]);
      const status = nativeElement.querySelector('.lobby__code-status') as HTMLElement;
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.textContent?.trim()).toBe('');

      copyButton(nativeElement).click();
      await Promise.resolve();
      fixture.detectChanges();
      expect(status.textContent?.trim()).toBe('Copied');
    });

    it('does not claim success when the clipboard write fails, and keeps the code visible', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('denied'));
      stubClipboard(writeText);
      const { nativeElement, fixture } = render('p1', [player('p1', 'Alice', false)]);

      copyButton(nativeElement).click();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      const status = nativeElement.querySelector('.lobby__code-status') as HTMLElement;
      expect(status.textContent?.trim()).not.toBe('Copied');
      expect(status.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      expect(status.className).toContain('lobby__code-status--failure');
      expect(nativeElement.textContent ?? '').toContain('TORTUGA');
    });

    it('exposes a meaningful accessible name including the actual code', () => {
      const { nativeElement } = render('p1', [player('p1', 'Alice', false)]);
      expect(copyButton(nativeElement).getAttribute('aria-label')).toBe('Copy room code TORTUGA');
    });

    it('is a real interactive button, not a plain styled div', () => {
      const { nativeElement } = render('p1', [player('p1', 'Alice', false)]);
      expect(copyButton(nativeElement).tagName).toBe('BUTTON');
    });
  });

  describe('share invite control', () => {
    function stubShare(share: ReturnType<typeof vi.fn> | undefined): void {
      Object.defineProperty(navigator, 'share', {
        value: share,
        configurable: true,
        writable: true,
      });
    }

    afterEach(() => {
      stubShare(undefined);
    });

    it('never calls the Web Share API on load, only on a genuine click', () => {
      const share = vi.fn().mockResolvedValue(undefined);
      stubShare(share);
      render('p1', [player('p1', 'Alice', false)]);
      expect(share).not.toHaveBeenCalled();
    });

    it('shares the actual room code when clicked and announces success', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      stubShare(share);
      const { nativeElement, fixture, shareButton } = render('p1', [player('p1', 'Alice', false)]);
      shareButton().dispatchEvent(new Event('click'));
      await Promise.resolve();
      fixture.detectChanges();

      expect(share).toHaveBeenCalledTimes(1);
      const call = share.mock.calls[0][0] as { text: string };
      expect(call.text).toContain('TORTUGA');
      const status = nativeElement.querySelector('.lobby__code-status') as HTMLElement;
      expect(status.textContent?.trim()).toBe('Shared');
    });

    it('reports unavailable, never a false success, when the Web Share API does not exist', () => {
      stubShare(undefined);
      const { nativeElement, fixture, shareButton } = render('p1', [player('p1', 'Alice', false)]);
      shareButton().dispatchEvent(new Event('click'));
      fixture.detectChanges();

      const status = nativeElement.querySelector('.lobby__code-status') as HTMLElement;
      expect(status.textContent?.trim()).not.toBe('Shared');
      expect(status.textContent ?? '').toMatch(/not available|isn't available/i);
      expect(nativeElement.textContent ?? '').toContain('TORTUGA');
    });

    it('does not report failure when the player simply cancels the native share sheet', async () => {
      const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
      const share = vi.fn().mockRejectedValue(abortError);
      stubShare(share);
      const { nativeElement, fixture, shareButton } = render('p1', [player('p1', 'Alice', false)]);
      shareButton().dispatchEvent(new Event('click'));
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      const status = nativeElement.querySelector('.lobby__code-status') as HTMLElement;
      expect(status.textContent?.trim()).toBe('');
    });

    it('reports failure without claiming success on a real share error', async () => {
      const share = vi.fn().mockRejectedValue(new Error('denied'));
      stubShare(share);
      const { nativeElement, fixture, shareButton } = render('p1', [player('p1', 'Alice', false)]);
      shareButton().dispatchEvent(new Event('click'));
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      const status = nativeElement.querySelector('.lobby__code-status') as HTMLElement;
      expect(status.textContent?.trim()).not.toBe('Shared');
      expect(status.className).toContain('lobby__code-status--failure');
    });
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
      const chip = row.querySelector('.lobby__ready-chip') as HTMLElement;

      expect(nameSpan.className).toContain('truncate');
      // The truncated span holds only the nickname text — "(you)" must never be inside it, or it
      // would be silently clipped along with a long nickname.
      expect(nameSpan.textContent?.trim()).toBe('Alice');
      expect(nameSpan.contains(youTag)).toBe(false);
      expect(nameSpan.contains(chip)).toBe(false);

      // Both must be flex-none siblings so they never shrink/truncate under space pressure.
      expect(youTag.className).toContain('flex-none');
      expect(chip.className).toContain('flex-none');
    });

    it('keeps local-player identity and ready state fully readable even with a very long nickname', () => {
      const longName = 'ACaptainWithAnExtraordinarilyLongPirateNickname';
      const { nativeElement } = render('p1', [player('p1', longName, true)]);
      const row = nativeElement.querySelector('.lobby__row') as HTMLElement;
      const youTag = row.querySelector('.lobby__you-tag');
      const chip = row.querySelector('.lobby__ready-chip');
      expect(youTag?.textContent ?? '').toContain('(you)');
      expect(chip?.textContent ?? '').toContain('Ready');
    });

    it('keeps every "(you)" tag and ready chip present and un-truncated across a full 12-player room', () => {
      const players = Array.from({ length: 12 }, (_, i) =>
        player(`p${i}`, `Player${i}`, i % 2 === 0),
      );
      const { nativeElement } = render('p0', players);
      const rows = Array.from(nativeElement.querySelectorAll('.lobby__row'));
      expect(rows).toHaveLength(12);

      const ownRow = rows.find((r) => r.className.includes('lobby__row--me'));
      expect(ownRow?.querySelector('.lobby__you-tag')?.textContent ?? '').toContain('(you)');

      for (const row of rows) {
        const chip = row.querySelector('.lobby__ready-chip');
        expect(chip?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      }
    });
  });
});
