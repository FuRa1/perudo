import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { LucideCopy, LucideDices, LucideShare2 } from '@lucide/angular';
import { RULES_CONFIG } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';

const COPY_STATUS_RESET_MS = 2000;
const SHARE_STATUS_RESET_MS = 4000;

type ShareStatus = 'idle' | 'success' | 'unavailable' | 'failure';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [IonContent, IonButton, LucideCopy, LucideDices, LucideShare2],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
})
export class Lobby implements OnDestroy {
  private readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly players = computed(() => this.store.matchState()?.players ?? []);
  protected readonly roomId = computed(() => this.store.matchState()?.roomId ?? '');
  protected readonly me = this.store.me;
  protected readonly playerId = this.store.playerId;

  protected readonly readyCount = computed(() => this.players().filter((p) => p.isReady).length);
  protected readonly allReady = computed(
    () => this.players().length > 0 && this.readyCount() === this.players().length,
  );

  // The same minimum the server enforces before a match can start (game-engine.ts) — read from
  // the shared rules config rather than restating "2" here as a second, driftable magic number.
  protected readonly minPlayers = RULES_CONFIG.players.min;
  protected readonly maxPlayers = RULES_CONFIG.players.max;

  /** Display-only host (CLAUDE.md 3.5/this rework's host decision): no `hostPlayerId` field exists
   * in shared state, and none is added here — the first player in `MatchState.players`' stable
   * seating order (state.types.ts) is, structurally, whoever's join created the room. Text-only
   * label in the template, no gameplay authority attached. */
  protected readonly hostPlayerId = computed(() => this.players()[0]?.id ?? null);

  /** "Seat N — open" placeholders for the rest of the table's capacity (5.1's 2-12 player range) —
   * turns the empty space below a small roster into real information about how many more can
   * join, instead of blank space (design reference §2a). */
  protected readonly openSeatNumbers = computed(() => {
    const seated = this.players().length;
    return Array.from({ length: Math.max(0, this.maxPlayers - seated) }, (_, i) => seated + i + 1);
  });

  /** Idle until a real tap/click; never set on load (a genuine user action is required — see
   * copyRoomCode). 'failure' distinguishes a real clipboard error from the ordinary idle state so
   * the announcement/label never claims success it didn't have. */
  protected readonly copyStatus = signal<'idle' | 'success' | 'failure'>('idle');
  private copyStatusResetHandle: ReturnType<typeof setTimeout> | null = null;

  protected readonly copyStatusMessage = computed(() => {
    switch (this.copyStatus()) {
      case 'success':
        return 'Copied';
      case 'failure':
        return "Couldn't copy — the code is still shown above.";
      default:
        return '';
    }
  });

  /** Same idle-until-a-real-tap contract as copyStatus above. 'unavailable' is its own state,
   * distinct from 'failure': a browser with no Web Share API isn't an error, just a capability the
   * device doesn't have — the message and the room code itself make Copy the obvious next step
   * either way. */
  protected readonly shareStatus = signal<ShareStatus>('idle');
  private shareStatusResetHandle: ReturnType<typeof setTimeout> | null = null;

  protected readonly shareStatusMessage = computed(() => {
    switch (this.shareStatus()) {
      case 'success':
        return 'Shared';
      case 'unavailable':
        return "Sharing isn't available on this device — use Copy instead.";
      case 'failure':
        return "Couldn't share — the code is still shown above.";
      default:
        return '';
    }
  });

  protected toggleReady(): void {
    const me = this.me();
    if (!me) {
      return;
    }
    this.socket.setReady(!me.isReady);
  }

  /** Only ever called from a real click/tap (lobby.html's (click) binding) — never on load or
   * reactively from a signal, so the room code is never written to the clipboard without the
   * player asking for it. Uses the standard web Clipboard API directly (no Capacitor plugin,
   * no native permission prompt needed for a same-origin secure-context write); on any failure —
   * API missing, insecure context, denied permission — this reports failure rather than lying
   * about success, and the code itself stays visible either way (it's never hidden by this). */
  protected copyRoomCode(): void {
    const code = this.roomId();
    if (!code || !navigator.clipboard?.writeText) {
      this.setCopyStatus('failure');
      return;
    }
    navigator.clipboard.writeText(code).then(
      () => this.setCopyStatus('success'),
      () => this.setCopyStatus('failure'),
    );
  }

  /** Web Share API only, same reasoning as copyRoomCode above. Most desktop browsers have no
   * `navigator.share` at all — reported as 'unavailable', never silently treated as success. A
   * user-cancelled share (`AbortError`) is neither a success nor a failure — they simply changed
   * their mind, so the status stays idle rather than claiming either outcome. */
  protected shareRoomCode(): void {
    const code = this.roomId();
    if (!code) {
      this.setShareStatus('failure');
      return;
    }
    if (!navigator.share) {
      this.setShareStatus('unavailable');
      return;
    }
    navigator
      .share({
        title: 'Perudo',
        text: `Join my Perudo table — code ${code}`,
        url: window.location.href,
      })
      .then(
        () => this.setShareStatus('success'),
        (error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
          this.setShareStatus('failure');
        },
      );
  }

  private setCopyStatus(status: 'success' | 'failure'): void {
    if (this.copyStatusResetHandle !== null) {
      clearTimeout(this.copyStatusResetHandle);
    }
    this.copyStatus.set(status);
    this.copyStatusResetHandle = setTimeout(() => {
      this.copyStatus.set('idle');
      this.copyStatusResetHandle = null;
    }, COPY_STATUS_RESET_MS);
  }

  private setShareStatus(status: Exclude<ShareStatus, 'idle'>): void {
    if (this.shareStatusResetHandle !== null) {
      clearTimeout(this.shareStatusResetHandle);
    }
    this.shareStatus.set(status);
    this.shareStatusResetHandle = setTimeout(() => {
      this.shareStatus.set('idle');
      this.shareStatusResetHandle = null;
    }, SHARE_STATUS_RESET_MS);
  }

  ngOnDestroy(): void {
    if (this.copyStatusResetHandle !== null) {
      clearTimeout(this.copyStatusResetHandle);
    }
    if (this.shareStatusResetHandle !== null) {
      clearTimeout(this.shareStatusResetHandle);
    }
  }

  /** The roster has no avatars (CLAUDE.md 3.5) — a nickname-derived initial on a fixed, repeating
   * gradient tile gives each row "enough visual distinction" (this task's own words) without
   * inventing a real avatar system. Deterministic from the nickname alone, so it never needs to
   * be stored or synced. */
  protected initialFor(nickname: string): string {
    return (nickname.trim()[0] ?? '?').toUpperCase();
  }
}
