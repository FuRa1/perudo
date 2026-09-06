import { Component } from '@angular/core';
import { BoardShell } from '@client/app/features/board/board-shell/board-shell';

/** Canonical MVP board. All viewport sizes ultimately render this mobile composition. */
@Component({
  selector: 'app-mobile-game-board',
  imports: [BoardShell],
  template: '<app-board-shell />',
  styles: ':host { display: block; min-height: 100dvh; }',
})
export class MobileGameBoard {}
