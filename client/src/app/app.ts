import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RULES_CONFIG } from 'shared';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('Perudo');
  protected readonly players = RULES_CONFIG.players;
}
