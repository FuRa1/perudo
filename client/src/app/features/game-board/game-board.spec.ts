import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GameBoard } from './game-board';

@Component({ selector: 'app-mobile-game-board', template: 'mobile-stub' })
class MobileGameBoardStub {}

@Component({ selector: 'app-desktop-game-board', template: 'desktop-stub' })
class DesktopGameBoardStub {}

/** Minimal fake of the one `MediaQueryList` surface GameBoard actually uses — real jsdom has no
 * `window.matchMedia` at all, so every test here has to supply its own. */
function matchMediaStub(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: '(min-width: 768px)',
    addEventListener: (_type: 'change', cb: (event: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_type: 'change', cb: (event: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    dispatch: (next: boolean) => {
      mql.matches = next;
      for (const cb of listeners) {
        cb({ matches: next } as MediaQueryListEvent);
      }
    },
  };
  return mql;
}

function render(initialMatches: boolean) {
  const mql = matchMediaStub(initialMatches);
  // jsdom has no `window.matchMedia` at all (unlike a real browser), so there is nothing for
  // `vi.spyOn` to wrap — it has to be assigned outright, and restored the same way afterwards.
  window.matchMedia = vi.fn().mockReturnValue(mql);
  TestBed.configureTestingModule({ imports: [GameBoard] }).overrideComponent(GameBoard, {
    set: { imports: [DesktopGameBoardStub, MobileGameBoardStub] },
  });
  const fixture = TestBed.createComponent(GameBoard);
  fixture.detectChanges();
  return { fixture, mql, el: fixture.nativeElement as HTMLElement };
}

describe('GameBoard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- deleting the per-test stub restores jsdom's own "not implemented" state.
    delete window.matchMedia;
  });

  it('renders the mobile board below the desktop breakpoint', () => {
    const { el } = render(false);
    expect(el.querySelector('app-mobile-game-board')).toBeTruthy();
    expect(el.querySelector('app-desktop-game-board')).toBeFalsy();
  });

  it('renders the desktop board at/above the desktop breakpoint', () => {
    const { el } = render(true);
    expect(el.querySelector('app-desktop-game-board')).toBeTruthy();
    expect(el.querySelector('app-mobile-game-board')).toBeFalsy();
  });

  it('switches boards live when the viewport crosses the breakpoint', () => {
    const { fixture, mql, el } = render(false);
    mql.dispatch(true);
    fixture.detectChanges();
    expect(el.querySelector('app-desktop-game-board')).toBeTruthy();
    expect(el.querySelector('app-mobile-game-board')).toBeFalsy();
  });

  it('removes its media-query listener on destroy', () => {
    const { fixture, mql } = render(false);
    const removeSpy = vi.spyOn(mql, 'removeEventListener');
    fixture.destroy();
    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
