import { Component } from '@angular/core';
import { LocalHandZone } from '../../../local-hand-zone/local-hand-zone';

/**
 * Placeholder for Variant A "Below deck" (designs/perudo-spotlight-gallery.dc.html) — a
 * spotlight above a horizontal scrollable rail of waiting players in turn order. Built for real
 * in Phase 2 of the dashboard-switching plan. Ships now so the match stays fully playable on
 * every layout choice from day one: your own hand still rolls and the wager/reveal slots still
 * render, only the opponent arrangement itself is a stand-in.
 */
@Component({
  selector: 'app-linear-dashboard',
  standalone: true,
  imports: [LocalHandZone],
  templateUrl: './linear-dashboard.html',
  styleUrl: './linear-dashboard.scss',
})
export class LinearDashboard {}
