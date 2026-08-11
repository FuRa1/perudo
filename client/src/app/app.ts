import { Component, inject } from '@angular/core';
import { GameStore } from './core/game-store';
import { Entry } from './features/entry/entry';
import { Lobby } from './features/lobby/lobby';
import { GameBoard } from './features/game-board/game-board';
import { Winner } from './features/winner/winner';

@Component({
  selector: 'app-root',
  imports: [Entry, GameBoard, Lobby, Winner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(GameStore);
}
