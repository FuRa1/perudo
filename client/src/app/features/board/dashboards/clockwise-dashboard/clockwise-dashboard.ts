import { Component } from '@angular/core';
import { LocalHandZone } from '../../../local-hand-zone/local-hand-zone';

/**
 * Placeholder for Variant B "Round the table" (designs/perudo-spotlight-gallery.dc.html) — a
 * spotlight with waiting players placed on an ellipse ring around it, so turn order *is* the
 * circle. Built for real in Phase 3 of the dashboard-switching plan. Ships now so the match stays
 * fully playable on every layout choice from day one.
 */
@Component({
  selector: 'app-clockwise-dashboard',
  standalone: true,
  imports: [LocalHandZone],
  templateUrl: './clockwise-dashboard.html',
  styleUrl: './clockwise-dashboard.scss',
})
export class ClockwiseDashboard {}
