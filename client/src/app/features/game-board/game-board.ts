import { Component, OnDestroy, signal } from '@angular/core';
import { DesktopGameBoard } from '../game-board-desktop/game-board-desktop';
import { MobileGameBoard } from '../game-board-mobile/game-board-mobile';

const DESKTOP_BOARD_QUERY = '(min-width: 768px)';

@Component({
  selector: 'app-game-board',
  imports: [DesktopGameBoard, MobileGameBoard],
  template: `
    @if (isDesktopViewport()) {
      <app-desktop-game-board />
    } @else {
      <app-mobile-game-board />
    }
  `,
  // See features/board/board-shell/board-shell.scss's :host comment — no :host rule defaults a custom element to
  // `display: inline`.
  styles: ':host { display: block; }',
})
export class GameBoard implements OnDestroy {
  private readonly desktopQuery = window.matchMedia(DESKTOP_BOARD_QUERY);
  protected readonly isDesktopViewport = signal(this.desktopQuery.matches);

  private readonly handleViewportChange = (event: MediaQueryListEvent): void => {
    this.isDesktopViewport.set(event.matches);
  };

  constructor() {
    this.desktopQuery.addEventListener('change', this.handleViewportChange);
  }

  ngOnDestroy(): void {
    this.desktopQuery.removeEventListener('change', this.handleViewportChange);
  }
}
