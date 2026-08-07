import { Component, inject } from '@angular/core';
import { GameStore } from './core/game-store';
import { Entry } from './features/entry/entry';
import { Lobby } from './features/lobby/lobby';
import { Table } from './features/table/table';
import { Winner } from './features/winner/winner';

@Component({
  selector: 'app-root',
  imports: [Entry, Lobby, Table, Winner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(GameStore);
}
