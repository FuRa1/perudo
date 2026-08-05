import { TestBed } from '@angular/core/testing';
import { Die } from './die';

describe('Die', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Die] });
  });

  it('renders exactly six ordinary pips for face 6, with no skull content', () => {
    const fixture = TestBed.createComponent(Die);
    fixture.componentRef.setInput('value', 6);
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const pipDots = nativeElement.querySelectorAll('.rounded-full.bg-ink');
    expect(pipDots.length).toBe(6);
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
      const pipDots = nativeElement.querySelectorAll('.rounded-full.bg-ink');
      expect(pipDots.length).toBe(expectedCount);
      expect(nativeElement.textContent).not.toContain('💀');
    }
  });
});
