import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ErrorCode, gameError } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { Entry } from './entry';

interface FakeSocket {
  connect: ReturnType<typeof vi.fn>;
  joinRoom: ReturnType<typeof vi.fn>;
  getServerUrl: ReturnType<typeof vi.fn>;
  setServerUrl: ReturnType<typeof vi.fn>;
}

function render() {
  const fixture = TestBed.createComponent(Entry);
  const store = TestBed.inject(GameStore);
  store.setConnected(true);
  fixture.detectChanges();
  const nativeElement = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    store,
    nativeElement,
    buttons: () => Array.from(nativeElement.querySelectorAll('ion-button')),
    otp: () => nativeElement.querySelector('ion-input-otp') as Element,
    backButton: () => nativeElement.querySelector<HTMLButtonElement>('.entry__back'),
  };
}

function setNickname(fixture: ReturnType<typeof TestBed.createComponent>, value: string): void {
  const nativeElement = fixture.nativeElement as HTMLElement;
  const input = nativeElement.querySelector('ion-input');
  input?.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
  fixture.detectChanges();
}

/** `ion-input-otp` isn't hydrated in this test environment (same reasoning as the existing
 * isDisabled()/fillOf() helpers below for ion-button) — a real Playwright run exercises its
 * actual per-character typing/paste/backspace behavior; here we only need to simulate the one DOM
 * event (`ionInput`) the component's own (ionInput) binding listens for. */
function setRoomCode(fixture: ReturnType<typeof TestBed.createComponent>, value: string): void {
  const nativeElement = fixture.nativeElement as HTMLElement;
  const otp = nativeElement.querySelector('ion-input-otp');
  otp?.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
  fixture.detectChanges();
}

/** Angular sets [disabled] on ion-button as a DOM property, not an HTML attribute — the custom
 * element isn't upgraded in this test environment, so read the property directly. */
function isDisabled(button: Element): boolean {
  return (button as unknown as { disabled: boolean }).disabled === true;
}

/** Reaches the join-code step the same way a real player does: type a nickname, then tap "Join
 * with a code" (never sends a join intent by itself). */
function goToCodeStep(
  fixture: ReturnType<typeof TestBed.createComponent>,
  nativeElement: HTMLElement,
  nickname = 'Jack',
): void {
  setNickname(fixture, nickname);
  const joinWithCodeBtn = Array.from(nativeElement.querySelectorAll('ion-button'))[1];
  joinWithCodeBtn.dispatchEvent(new Event('click'));
  fixture.detectChanges();
}

describe('Entry', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    socket = {
      connect: vi.fn(),
      joinRoom: vi.fn(),
      getServerUrl: vi.fn(() => 'http://localhost:3000'),
      setServerUrl: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [Entry],
      providers: [{ provide: SocketService, useValue: socket }],
    });
  });

  it('connects on load', () => {
    render();
    expect(socket.connect).toHaveBeenCalled();
  });

  describe('name step', () => {
    it('disables both actions until a nickname is entered', () => {
      const { buttons } = render();
      const [createBtn, joinWithCodeBtn] = buttons();
      expect(isDisabled(createBtn)).toBe(true);
      expect(isDisabled(joinWithCodeBtn)).toBe(true);
    });

    it('enables both actions once a nickname is present', () => {
      const { fixture, buttons } = render();
      setNickname(fixture, 'Jack');
      const [createBtn, joinWithCodeBtn] = buttons();
      expect(isDisabled(createBtn)).toBe(false);
      expect(isDisabled(joinWithCodeBtn)).toBe(false);
    });

    it('does not show a room-code field on this step', () => {
      const { nativeElement } = render();
      expect(nativeElement.querySelector('ion-input-otp')).toBeNull();
    });

    it('creates a room with a generated, five-character code and the trimmed nickname', () => {
      const { fixture, buttons } = render();
      setNickname(fixture, '  Jack  ');
      buttons()[0].click();
      expect(socket.joinRoom).toHaveBeenCalledTimes(1);
      const [roomIdArg, nicknameArg] = socket.joinRoom.mock.calls[0] as [string, string];
      expect(roomIdArg).toHaveLength(5);
      expect(nicknameArg).toBe('Jack');
    });

    it('does not create a room when clicked with no nickname', () => {
      const { buttons } = render();
      buttons()[0].click();
      expect(socket.joinRoom).not.toHaveBeenCalled();
    });

    it('submits Start a table on Enter in the nickname field', () => {
      const { fixture, nativeElement } = render();
      setNickname(fixture, 'Jack');
      const input = nativeElement.querySelector('ion-input');
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();
      expect(socket.joinRoom).toHaveBeenCalledTimes(1);
    });

    it('disables Start a table while not yet connected, but never sends a join', () => {
      const fixture = TestBed.createComponent(Entry);
      const store = TestBed.inject(GameStore);
      store.setConnected(false);
      fixture.detectChanges();
      const nativeElement = fixture.nativeElement as HTMLElement;
      setNickname(fixture, 'Jack');
      const [createBtn] = Array.from(nativeElement.querySelectorAll('ion-button'));
      expect(isDisabled(createBtn)).toBe(true);
      expect(nativeElement.textContent ?? '').toContain('Offline');
    });

    it('still allows moving to the code step while not yet connected', () => {
      const fixture = TestBed.createComponent(Entry);
      const store = TestBed.inject(GameStore);
      store.setConnected(false);
      fixture.detectChanges();
      const nativeElement = fixture.nativeElement as HTMLElement;
      goToCodeStep(fixture, nativeElement);
      expect(nativeElement.querySelector('ion-input-otp')).not.toBeNull();
    });

    it('shows a loading state on Start a table while the request is in flight', () => {
      const { fixture, buttons, nativeElement } = render();
      setNickname(fixture, 'Jack');
      buttons()[0].click();
      fixture.detectChanges();
      expect(nativeElement.textContent ?? '').toContain('Creating');
    });

    it('shows the server error and clears the loading state once an error arrives', () => {
      const { fixture, store, nativeElement, buttons } = render();
      setNickname(fixture, 'Jack');
      buttons()[0].click();
      fixture.detectChanges();
      expect(nativeElement.textContent ?? '').toContain('Creating');

      store.setError(gameError(ErrorCode.ROOM_FULL, 'This room is already full.'));
      fixture.detectChanges();

      expect(nativeElement.textContent ?? '').toContain('This room is already full.');
      expect(nativeElement.textContent ?? '').not.toContain('Creating');
    });

    it('does not render any spectator/public-table-browser controls', () => {
      const { nativeElement } = render();
      expect(nativeElement.textContent ?? '').not.toMatch(/watch instead|tables are lit/i);
    });
  });

  describe('join-code step', () => {
    it('moves to the code step without sending a join, keeping the nickname', () => {
      const { fixture, nativeElement } = render();
      goToCodeStep(fixture, nativeElement, 'Jack');
      expect(socket.joinRoom).not.toHaveBeenCalled();
      expect(nativeElement.textContent ?? '').toContain('Jack');
    });

    it('renders the room-code control with five slots', () => {
      const { fixture, nativeElement, otp } = render();
      goToCodeStep(fixture, nativeElement);
      expect((otp() as unknown as { length: number }).length).toBe(5);
    });

    // The required length is carried by the control's own accessible name rather than by a
    // separate paragraph beside it: the visible copy states it once (in the subtitle), and a
    // screen reader gets it from the field itself instead of from a nearby <p> the input was
    // never actually associated with.
    it('exposes an accessible name for the room-code control that states the required length', () => {
      const { fixture, nativeElement, otp } = render();
      goToCodeStep(fixture, nativeElement);
      expect(otp().getAttribute('aria-label')).toBe('Room code, 5 characters');
    });

    it('states the exact required length in the visible copy, exactly once', () => {
      const { fixture, nativeElement } = render();
      goToCodeStep(fixture, nativeElement);
      const text = nativeElement.textContent ?? '';
      expect(text).toContain('5 characters from whoever opened');
      expect(text).not.toContain('Enter the 5-character invitation code.');
    });

    it('keeps Join table disabled while the code is partial', () => {
      const { fixture, nativeElement, buttons } = render();
      goToCodeStep(fixture, nativeElement);
      setRoomCode(fixture, 'TOR');
      expect(isDisabled(buttons()[0])).toBe(true);
    });

    it('enables Join table once the code reaches exactly five characters', () => {
      const { fixture, nativeElement, buttons } = render();
      goToCodeStep(fixture, nativeElement);
      setRoomCode(fixture, 'TORTU');
      expect(isDisabled(buttons()[0])).toBe(false);
    });

    it('a partial code remains visible rather than being auto-cleared', () => {
      const { fixture, nativeElement, otp } = render();
      goToCodeStep(fixture, nativeElement);
      setRoomCode(fixture, 'TOR');
      expect((otp() as unknown as { value: string }).value).toBe('TOR');
    });

    it('caps the room-code signal at five characters as a safety net independent of the OTP control', () => {
      const { fixture, nativeElement, otp } = render();
      goToCodeStep(fixture, nativeElement);
      setRoomCode(fixture, 'TOOLONGVALUE');
      expect((otp() as unknown as { value: string }).value).toBe('TOOLO');
    });

    it('joins the exact five-character code entered, case preserved, with the trimmed nickname', () => {
      const { fixture, nativeElement, buttons } = render();
      goToCodeStep(fixture, nativeElement, '  Jack  ');
      setRoomCode(fixture, 'tortu');
      buttons()[0].click();
      expect(socket.joinRoom).toHaveBeenCalledWith('tortu', 'Jack');
    });

    it('does not submit when the code is blank, even if clicked', () => {
      const { fixture, nativeElement, buttons } = render();
      goToCodeStep(fixture, nativeElement);
      buttons()[0].click();
      expect(socket.joinRoom).not.toHaveBeenCalled();
    });

    it('does not fire a duplicate join while a request is already pending', () => {
      const { fixture, nativeElement, buttons } = render();
      goToCodeStep(fixture, nativeElement);
      setRoomCode(fixture, 'TORTU');
      buttons()[0].click();
      buttons()[0].click();
      expect(socket.joinRoom).toHaveBeenCalledTimes(1);
    });

    it('shows a loading state on Join table while the request is in flight', () => {
      const { fixture, nativeElement, buttons } = render();
      goToCodeStep(fixture, nativeElement);
      setRoomCode(fixture, 'TORTU');
      buttons()[0].click();
      fixture.detectChanges();
      expect(nativeElement.textContent ?? '').toContain('Joining');
    });

    it('disables Join table while not yet connected', () => {
      const fixture = TestBed.createComponent(Entry);
      const store = TestBed.inject(GameStore);
      store.setConnected(false);
      fixture.detectChanges();
      const nativeElement = fixture.nativeElement as HTMLElement;
      goToCodeStep(fixture, nativeElement);
      setRoomCode(fixture, 'TORTU');
      const [joinBtn] = Array.from(nativeElement.querySelectorAll('ion-button'));
      expect(isDisabled(joinBtn)).toBe(true);
    });

    it('submits Join table on Enter in the code control once complete', () => {
      const { fixture, nativeElement } = render();
      goToCodeStep(fixture, nativeElement, 'Jack');
      setRoomCode(fixture, 'TORTU');
      const otpEl = nativeElement.querySelector('ion-input-otp');
      otpEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();
      expect(socket.joinRoom).toHaveBeenCalledWith('TORTU', 'Jack');
    });

    it('does not submit on Enter while the code is only partially entered', () => {
      const { fixture, nativeElement } = render();
      goToCodeStep(fixture, nativeElement);
      setRoomCode(fixture, 'TOR');
      const otpEl = nativeElement.querySelector('ion-input-otp');
      otpEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();
      expect(socket.joinRoom).not.toHaveBeenCalled();
    });

    it('returns to the name step on back, keeping the nickname, without sending a join', () => {
      const { fixture, nativeElement, backButton } = render();
      goToCodeStep(fixture, nativeElement, 'Jack');
      setRoomCode(fixture, 'TOR');
      backButton()?.click();
      fixture.detectChanges();
      expect(nativeElement.querySelector('ion-input-otp')).toBeNull();
      const nicknameInput = nativeElement.querySelector('ion-input');
      expect((nicknameInput as unknown as { value: string })?.value).toBe('Jack');
      expect(socket.joinRoom).not.toHaveBeenCalled();
    });

    it('clears a stale error from a failed join when navigating back', () => {
      const { fixture, store, nativeElement, buttons, backButton } = render();
      goToCodeStep(fixture, nativeElement, 'Jack');
      setRoomCode(fixture, 'TORTU');
      buttons()[0].click();
      store.setError(gameError(ErrorCode.ROOM_NOT_FOUND, 'No table with that code.'));
      fixture.detectChanges();
      expect(nativeElement.textContent ?? '').toContain('No table with that code.');

      backButton()?.click();
      fixture.detectChanges();
      expect(nativeElement.textContent ?? '').not.toContain('No table with that code.');
    });

    it('keeps an invalid-join error visible without losing the entered code', () => {
      const { fixture, store, nativeElement, buttons, otp } = render();
      goToCodeStep(fixture, nativeElement, 'Jack');
      setRoomCode(fixture, 'TORTU');
      buttons()[0].click();
      store.setError(gameError(ErrorCode.ROOM_NOT_FOUND, 'No table with that code.'));
      fixture.detectChanges();

      expect(nativeElement.textContent ?? '').toContain('No table with that code.');
      expect((otp() as unknown as { value: string }).value).toBe('TORTU');
    });
  });

  describe('reconnect session-restore failure (section 7 / Phase 4 error-state UX)', () => {
    it('shows a friendly, non-alarming notice on the name step when a saved session could not be restored', () => {
      const { fixture, store, nativeElement } = render();
      store.setSessionRestoreFailed();
      fixture.detectChanges();
      expect(nativeElement.textContent ?? '').toContain("couldn't restore your previous table");
      // Distinct from the generic error toast — never shown as a scary role="alert".
      expect(nativeElement.querySelector('.entry__notice')?.getAttribute('role')).toBe('status');
    });

    it('does not show the notice by default', () => {
      const { nativeElement } = render();
      expect(nativeElement.querySelector('.entry__notice')).toBeNull();
    });
  });
});
