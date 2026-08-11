import { TestBed } from '@angular/core/testing';
import { Die } from './die';
import { VISUAL_ASSETS_CONFIG } from '../visual-assets/visual-assets.config';

describe('Die', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Die] });
  });

  describe('sprite rendering (default: designs/assets/dice/dice-sprite.png is configured)', () => {
    const expectedPositionX: Record<number, string> = {
      1: '0%',
      2: '20%',
      3: '40%',
      4: '60%',
      5: '80%',
      6: '100%',
    };

    it('positions the correct sprite frame for every face, with no pips and no skull content', () => {
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

    it('preserves the accessible label and role on the die wrapper', () => {
      const fixture = TestBed.createComponent(Die);
      fixture.componentRef.setInput('value', 3);
      fixture.detectChanges();

      const dieEl = (fixture.nativeElement as HTMLElement).querySelector('.die') as HTMLElement;
      expect(dieEl.getAttribute('role')).toBe('img');
      expect(dieEl.getAttribute('aria-label')).toBe('Three');
    });
  });

  describe('CSS pip fallback (no sprite asset configured)', () => {
    let originalSpriteUrl: string | undefined;

    beforeEach(() => {
      originalSpriteUrl = VISUAL_ASSETS_CONFIG.diceSprite.imageUrl;
      // VisualAssetSlot.imageUrl is readonly by design (client code should never mutate it) — the
      // cast here is test-only, exercising the same "no asset configured yet" state the manifest
      // was actually in before Step 1/2 populated it, to prove the CSS pip renderer still works.
      (VISUAL_ASSETS_CONFIG.diceSprite as { imageUrl?: string }).imageUrl = undefined;
    });

    afterEach(() => {
      (VISUAL_ASSETS_CONFIG.diceSprite as { imageUrl?: string }).imageUrl = originalSpriteUrl;
    });

    it('renders exactly six ordinary pips for face 6, with no skull content, and no sprite div', () => {
      const fixture = TestBed.createComponent(Die);
      fixture.componentRef.setInput('value', 6);
      fixture.detectChanges();

      const nativeElement = fixture.nativeElement as HTMLElement;
      const pipDots = nativeElement.querySelectorAll('.rounded-full.die__pip');
      expect(pipDots.length).toBe(6);
      expect(nativeElement.querySelector('.die__sprite')).toBeNull();
      expect(nativeElement.textContent).not.toContain('💀');
      expect(nativeElement.innerHTML.toLowerCase()).not.toContain('skull');
    });

    it('renders the correct pip count for every other face, none containing a skull', () => {
      const expectedPipCounts: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

      for (const [value, expectedCount] of Object.entries(expectedPipCounts)) {
        const fixture = TestBed.createComponent(Die);
        fixture.componentRef.setInput('value', Number(value));
        fixture.detectChanges();

        const nativeElement = fixture.nativeElement as HTMLElement;
        const pipDots = nativeElement.querySelectorAll('.rounded-full.die__pip');
        expect(pipDots.length).toBe(expectedCount);
        expect(nativeElement.textContent).not.toContain('💀');
      }
    });
  });
});
