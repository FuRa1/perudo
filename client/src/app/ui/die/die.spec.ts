import { TestBed } from '@angular/core/testing';
import { DICE_FACES_CONFIG } from '@shared';
import { Die } from './die';
import { VISUAL_ASSETS_CONFIG } from '../visual-assets/visual-assets.config';

/** `DiceFaceVisual.imageUrl` is readonly by design (client code should never mutate it) — these
 * casts are test-only, temporarily clearing one or both real-art sources to prove each fallback
 * tier in `Die`'s own priority order (die.ts's doc comment) still renders correctly on its own,
 * exactly as it would before that tier's art was ever integrated. */
function withoutFaceImages<T>(run: () => T): T {
  const originals = DICE_FACES_CONFIG.map((f) => f.imageUrl);
  for (const face of DICE_FACES_CONFIG) {
    (face as { imageUrl?: string }).imageUrl = undefined;
  }
  try {
    return run();
  } finally {
    DICE_FACES_CONFIG.forEach((f, i) => {
      (f as { imageUrl?: string }).imageUrl = originals[i];
    });
  }
}

function withoutSprite<T>(run: () => T): T {
  const original = VISUAL_ASSETS_CONFIG.diceSprite.imageUrl;
  (VISUAL_ASSETS_CONFIG.diceSprite as { imageUrl?: string }).imageUrl = undefined;
  try {
    return run();
  } finally {
    (VISUAL_ASSETS_CONFIG.diceSprite as { imageUrl?: string }).imageUrl = original;
  }
}

describe('Die', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Die] });
  });

  describe('per-face image rendering (tier 1, default: DICE_FACES_CONFIG has real art per face)', () => {
    it('renders the configured image for every face, with no pips, no sprite div, and no skull content', () => {
      for (const face of DICE_FACES_CONFIG) {
        const fixture = TestBed.createComponent(Die);
        fixture.componentRef.setInput('value', face.value);
        fixture.detectChanges();

        const nativeElement = fixture.nativeElement as HTMLElement;
        const img = nativeElement.querySelector('img');
        expect(img?.getAttribute('src')).toBe(face.imageUrl);
        expect(img?.getAttribute('alt')).toBe(face.label);
        expect(nativeElement.querySelector('.die__sprite')).toBeNull();
        expect(nativeElement.querySelectorAll('.die__pip').length).toBe(0);
        expect(nativeElement.textContent).not.toContain('💀');
        expect(nativeElement.innerHTML.toLowerCase()).not.toContain('skull');
      }
    });

    it('preserves the accessible label and role on the die wrapper', () => {
      const fixture = TestBed.createComponent(Die);
      fixture.componentRef.setInput('value', 3);
      fixture.detectChanges();

      const dieEl = (fixture.nativeElement as HTMLElement).querySelector('.die') as HTMLElement;
      expect(dieEl.getAttribute('role')).toBe('img');
      expect(dieEl.getAttribute('aria-label')).toBe('Three');
    });

    // The art PNG is itself a complete die (body, outline, baked shadow). The wrapper used to
    // paint its own ivory body underneath it regardless, which showed through the art's
    // transparent margin as a phantom second border with a ring of dead space inside every die.
    it('marks the wrapper as art-backed so it stops painting its own die body underneath the image', () => {
      const fixture = TestBed.createComponent(Die);
      fixture.componentRef.setInput('value', 3);
      fixture.detectChanges();

      const dieEl = (fixture.nativeElement as HTMLElement).querySelector('.die') as HTMLElement;
      expect(dieEl.classList).toContain('die--art');
      expect(dieEl.querySelector('img')?.classList).toContain('die__art');
    });

    it('keeps the art class off the CSS-pip tier, which does still need the wrapper to draw the body', () => {
      withoutFaceImages(() => {
        withoutSprite(() => {
          const fixture = TestBed.createComponent(Die);
          fixture.componentRef.setInput('value', 3);
          fixture.detectChanges();

          const dieEl = (fixture.nativeElement as HTMLElement).querySelector('.die') as HTMLElement;
          expect(dieEl.classList).not.toContain('die--art');
        });
      });
    });
  });

  describe('sprite-sheet fallback (tier 2: no per-face image, dice sprite configured)', () => {
    const expectedPositionX: Record<number, string> = {
      1: '0%',
      2: '20%',
      3: '40%',
      4: '60%',
      5: '80%',
      6: '100%',
    };

    it('positions the correct sprite frame for every face, with no pips and no skull content', () => {
      withoutFaceImages(() => {
        for (const [value, positionX] of Object.entries(expectedPositionX)) {
          const fixture = TestBed.createComponent(Die);
          fixture.componentRef.setInput('value', Number(value));
          fixture.detectChanges();

          const nativeElement = fixture.nativeElement as HTMLElement;
          const sprite = nativeElement.querySelector<HTMLElement>('.die__sprite');
          expect(sprite).not.toBeNull();
          expect(sprite?.style.backgroundPositionX).toBe(positionX);
          expect(nativeElement.querySelectorAll('.die__pip').length).toBe(0);
          expect(nativeElement.textContent).not.toContain('💀');
          expect(nativeElement.innerHTML.toLowerCase()).not.toContain('skull');
        }
      });
    });
  });

  describe('CSS pip fallback (tier 3: neither a per-face image nor the sprite is configured)', () => {
    it('renders exactly six ordinary pips for face 6, with no skull content and no sprite div', () => {
      withoutFaceImages(() =>
        withoutSprite(() => {
          const fixture = TestBed.createComponent(Die);
          fixture.componentRef.setInput('value', 6);
          fixture.detectChanges();

          const nativeElement = fixture.nativeElement as HTMLElement;
          const pipDots = nativeElement.querySelectorAll('.rounded-full.die__pip');
          expect(pipDots.length).toBe(6);
          expect(nativeElement.querySelector('.die__sprite')).toBeNull();
          expect(nativeElement.textContent).not.toContain('💀');
          expect(nativeElement.innerHTML.toLowerCase()).not.toContain('skull');
        }),
      );
    });

    it('renders the correct pip count for every other face, none containing a skull', () => {
      const expectedPipCounts: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

      withoutFaceImages(() =>
        withoutSprite(() => {
          for (const [value, expectedCount] of Object.entries(expectedPipCounts)) {
            const fixture = TestBed.createComponent(Die);
            fixture.componentRef.setInput('value', Number(value));
            fixture.detectChanges();

            const nativeElement = fixture.nativeElement as HTMLElement;
            const pipDots = nativeElement.querySelectorAll('.rounded-full.die__pip');
            expect(pipDots.length).toBe(expectedCount);
            expect(nativeElement.textContent).not.toContain('💀');
          }
        }),
      );
    });
  });
});
