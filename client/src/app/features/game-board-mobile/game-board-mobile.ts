import { Component } from '@angular/core';
import { Table } from '@client/app/features/table/table';

/** Canonical MVP board. All viewport sizes ultimately render this mobile composition. */
@Component({
  selector: 'app-mobile-game-board',
  imports: [Table],
  template: '<app-table />',
  styles: ':host { display: block; min-height: 100dvh; }',
})
export class MobileGameBoard {}
