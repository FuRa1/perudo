import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ErrorCode, gameError } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { Entry } from './entry';

interface FakeSocket {
  connect: ReturnType<typeof vi.fn>;
  joinRoom: ReturnType<typeof vi.fn>;
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
  };
}

function setInputValue(
  fixture: ReturnType<typeof TestBed.createComponent>,
  index: number,
  value: string,
): void {
  const nativeElement = fixture.nativeElement as HTMLElement;
  const input = nativeElement.querySelectorAll('ion-input')[index];
  input.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
  fixture.detectChanges();
}

/** Angular sets [disabled] on ion-button as a DOM property, not an HTML attribute — the custom
 * element isn't upgraded in this test environment, so read the property directly. */
function isDisabled(button: Element): boolean {
  return (button as unknown as { disabled: boolean }).disabled === true;
}

describe('Entry', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    socket = { connect: vi.fn(), joinRoom: vi.fn() };
    TestBed.configureTestingModule({
      imports: [Entry],
      providers: [{ provide: SocketService, useValue: socket }],
    });
  });

  it('connects on load', () => {
    render();
    expect(socket.connect).toHaveBeenCalled();
  });

  it('disables both actions until a nickname is entered', () => {
    const { buttons } = render();
    const [createBtn, joinBtn] = buttons();
    expect(isDisabled(createBtn)).toBe(true);
    expect(isDisabled(joinBtn)).toBe(true);
  });

  it('enables Create once a nickname is present, independent of room code', () => {
    const { fixture, buttons } = render();
    setInputValue(fixture, 1, 'Jack');
    const [createBtn, joinBtn] = buttons();
    expect(isDisabled(createBtn)).toBe(false);
    expect(isDisabled(joinBtn)).toBe(true);
  });

  it('enables Join only once both room code and nickname are present', () => {
    const { fixture, buttons } = render();
    setInputValue(fixture, 0, 'TORTUGA');
    setInputValue(fixture, 1, 'Jack');
    const [, joinBtn] = buttons();
    expect(isDisabled(joinBtn)).toBe(false);
  });

  it('creates a room with a generated code and the trimmed nickname', () => {
    const { fixture, buttons } = render();
    setInputValue(fixture, 1, '  Jack  ');
    buttons()[0].click();
    expect(socket.joinRoom).toHaveBeenCalledTimes(1);
    const [roomIdArg, nicknameArg] = socket.joinRoom.mock.calls[0] as [string, string];
    expect(typeof roomIdArg).toBe('string');
    expect(roomIdArg.length).toBeGreaterThan(0);
    expect(nicknameArg).toBe('Jack');
  });

  it('joins the exact room code entered, trimmed, with the trimmed nickname', () => {
    const { fixture, buttons } = render();
    setInputValue(fixture, 0, '  tortuga  ');
    setInputValue(fixture, 1, '  Jack  ');
    buttons()[1].click();
    expect(socket.joinRoom).toHaveBeenCalledWith('tortuga', 'Jack');
  });

  it('does not submit when the required fields are blank, even if clicked', () => {
    const { buttons } = render();
    buttons()[0].click();
    buttons()[1].click();
    expect(socket.joinRoom).not.toHaveBeenCalled();
  });

  it('disables both actions while not yet connected to the server', () => {
    const fixture = TestBed.createComponent(Entry);
    const store = TestBed.inject(GameStore);
    store.setConnected(false);
    fixture.detectChanges();
    const nativeElement = fixture.nativeElement as HTMLElement;
    setInputValue(fixture, 0, 'TORTUGA');
    setInputValue(fixture, 1, 'Jack');
    const buttons = Array.from(nativeElement.querySelectorAll('ion-button'));
    expect(isDisabled(buttons[0])).toBe(true);
    expect(isDisabled(buttons[1])).toBe(true);
    expect(nativeElement.textContent ?? '').toContain('Connecting');
  });

  it('shows a loading state on the button that was pressed while the request is in flight', () => {
    const { fixture, buttons, nativeElement } = render();
    setInputValue(fixture, 1, 'Jack');
    buttons()[0].click();
    fixture.detectChanges();
    expect(nativeElement.textContent ?? '').toContain('Creating');
  });

  // Design QA Task 6, finding 3: the room-code field's "leave it blank" instruction used to be
  // packed entirely into the placeholder, where it got clipped on both desktop and mobile.
  describe('room-code instruction (Design QA Task 6)', () => {
    it('uses a short placeholder that fits, not the full instruction', () => {
      const { nativeElement } = render();
      const roomCodeInput = nativeElement.querySelector('ion-input[label="Room code"]');
      const placeholder =
        roomCodeInput?.getAttribute('placeholder') ??
        (roomCodeInput as unknown as { placeholder?: string } | null)?.placeholder;
      expect(placeholder).toBe('e.g. TORTUGA');
    });

    it('moves the actual instruction into visible helper text below the field', () => {
      const { nativeElement } = render();
      const roomCodeInput = nativeElement.querySelector('ion-input[label="Room code"]');
      const helperText =
        roomCodeInput?.getAttribute('helperText') ??
        roomCodeInput?.getAttribute('helpertext') ??
        (roomCodeInput as unknown as { helperText?: string } | null)?.helperText;
      expect(helperText).toBe('Leave blank to start a new table.');
    });

    it('does not smuggle the instruction back into the room-code placeholder', () => {
      const { nativeElement } = render();
      const roomCodeInput = nativeElement.querySelector('ion-input[label="Room code"]');
      const placeholder =
        roomCodeInput?.getAttribute('placeholder') ??
        (roomCodeInput as unknown as { placeholder?: string } | null)?.placeholder;
      expect(placeholder ?? '').not.toContain('leave blank');
    });
  });

  it('shows the server error and clears the loading state once an error arrives', () => {
    const { fixture, store, nativeElement, buttons } = render();
    setInputValue(fixture, 1, 'Jack');
    buttons()[0].click();
    fixture.detectChanges();
    expect(nativeElement.textContent ?? '').toContain('Creating');

    store.setError(gameError(ErrorCode.ROOM_FULL, 'This room is already full.'));
    fixture.detectChanges();

    expect(nativeElement.textContent ?? '').toContain('This room is already full.');
    expect(nativeElement.textContent ?? '').not.toContain('Creating');
  });
});
