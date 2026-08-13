import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonInput,
  IonInputOtp,
  IonItem,
  IonList,
  IonSpinner,
} from '@ionic/angular/standalone';
import { LucideArrowLeft, LucideDices, LucideLamp } from '@lucide/angular';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';

// Excludes visually-ambiguous characters (0/O, 1/I/L) — this is a shareable room code, not
// game-fairness RNG (6.4 only governs dice), so plain Math.random() is fine here.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Centralized here so the segmented invitation-code input (entry.html's `ion-input-otp`) and
// generation below share one real value instead of the input silently assuming a slot count that
// generation could drift away from. Presentation-only concern (5.1's room-code format isn't a
// shared/server rule — the server treats roomId as an opaque string), so this stays a local
// client constant rather than moving into `@shared`. The design reference (designs/perudo-lobby-
// lantern.dc.html §1a2) shows six slots and says "six letters" — deliberately NOT followed here;
// per the Claude prompt that drove this rework, the live five-character contract (below, and the
// tests that assert it) is preserved, the mockup's slot count is treated as visual reference only.
const ROOM_CODE_LENGTH = 5;

// Both cases accepted while typing (native keyboards don't reliably respect autocapitalize, and a
// pasted code may arrive lowercase) — display-uppercased via CSS only, same as the plain-input
// implementation this replaces; the underlying signal keeps whatever case was actually entered
// (5.3's room code is compared case-sensitively-as-typed, see entry.spec.ts).
const ROOM_CODE_INPUT_PATTERN = '[ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz2-9]';

function generateRoomCode(length = ROOM_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

type PendingAction = 'create' | 'join' | null;

/** One question at a time (design reference §1a/§1a2): the nickname is collected once on `'name'`
 * and never asked again — `'code'` is a separate step reached only via "Join with a code", not a
 * field shown alongside the create action. */
type EntryStep = 'name' | 'code';

@Component({
  selector: 'app-entry',
  standalone: true,
  imports: [
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonInputOtp,
    IonButton,
    IonSpinner,
    LucideArrowLeft,
    LucideDices,
    LucideLamp,
  ],
  templateUrl: './entry.html',
  styleUrl: './entry.scss',
})
export class Entry {
  protected readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly step = signal<EntryStep>('name');
  protected readonly roomId = signal('');
  protected readonly nickname = signal('');
  protected readonly roomCodeLength = ROOM_CODE_LENGTH;
  protected readonly roomCodePattern = ROOM_CODE_INPUT_PATTERN;

  /** Which action is currently awaiting a server response, if any — drives the loading state on
   * whichever button was actually pressed. Purely presentational: the real join is still only
   * ever confirmed by the server's 'joined'/'error' events (6.6), this never assumes success. */
  protected readonly pendingAction = signal<PendingAction>(null);
  protected readonly connected = this.store.connected;

  /** Both paths need a nickname before they can do anything real — gates Create directly, and
   * gates even navigating to the code step (no point typing an invitation code with nowhere to
   * attach it). */
  protected readonly hasNickname = computed(() => !!this.nickname().trim());
  protected readonly canJoin = computed(
    () => this.hasNickname() && this.roomId().trim().length === ROOM_CODE_LENGTH,
  );

  constructor() {
    this.socket.connect();
    // A returned error (e.g. the room was full) means the attempt already failed — stop showing
    // a loading state so the player can see the error and try again. Success needs no matching
    // reset here: app.html swaps this whole component out the moment playerId() is set.
    effect(() => {
      if (this.store.lastError()) {
        this.pendingAction.set(null);
      }
    });
  }

  /** Navigation only — never sends a join intent. Doesn't gate on `connected()` (unlike
   * createRoom/joinRoom below): the design direction keeps connection status a quiet line at the
   * bottom, not a blocker on moving between steps of the form itself. */
  protected goToCodeStep(): void {
    if (!this.hasNickname() || this.pendingAction() !== null) {
      return;
    }
    this.store.clearError();
    this.step.set('code');
  }

  protected backToNameStep(): void {
    this.store.clearError();
    this.step.set('name');
  }

  protected createRoom(): void {
    if (!this.hasNickname() || !this.connected() || this.pendingAction() !== null) {
      return;
    }
    this.pendingAction.set('create');
    this.socket.joinRoom(generateRoomCode(), this.nickname().trim());
  }

  protected joinRoom(): void {
    if (!this.canJoin() || !this.connected() || this.pendingAction() !== null) {
      return;
    }
    this.pendingAction.set('join');
    this.socket.joinRoom(this.roomId().trim(), this.nickname().trim());
  }

  /** `ion-input-otp` already caps input at its own `[length]`, but that capping runs inside the
   * component's own logic — this is a cheap, independently-testable safety net on the signal
   * itself rather than trusting a third-party component to always enforce it (e.g. a future Ionic
   * change, or an event dispatched by something other than genuine user typing/paste). Slicing,
   * not rejecting: matches the component's own behavior of keeping the first N valid characters
   * rather than discarding the whole input. */
  protected setRoomCode(value: string): void {
    this.roomId.set(value.slice(0, ROOM_CODE_LENGTH));
  }

  /** Enter in the nickname field submits the step's one solid/primary action (Start a table) —
   * "Join with a code" stays a deliberate tap since it only navigates, never sends anything. */
  protected submitNameStep(): void {
    this.createRoom();
  }

  protected submitCodeStep(): void {
    this.joinRoom();
  }
}
