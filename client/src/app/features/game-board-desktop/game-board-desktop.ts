import { Component } from '@angular/core';
import { MobileGameBoard } from '../game-board-mobile/game-board-mobile';

/** Future desktop-board seam; the MVP deliberately presents the canonical mobile board. */
@Component({
  selector: 'app-desktop-game-board',
  imports: [MobileGameBoard],
  template: `
    <main class="desktop-board-stage">
      <div class="desktop-board-stage__phone"><app-mobile-game-board /></div>
    </main>
  `,
  styleUrl: './game-board-desktop.scss',
})
export class DesktopGameBoard {}
