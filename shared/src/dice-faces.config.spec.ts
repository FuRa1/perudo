import { DICE_FACES_CONFIG } from './dice-faces.config';

describe('DICE_FACES_CONFIG (3.4, 8.2)', () => {
  it('has exactly one entry per die value 1-6', () => {
    expect(DICE_FACES_CONFIG.map((f) => f.value)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('marks only the ace (1) as wild', () => {
    for (const face of DICE_FACES_CONFIG) {
      expect(face.isAce).toBe(face.value === 1);
    }
  });

  it('has a real per-face image for every value, distinct from one another (Phase 4 asset integration)', () => {
    const urls = DICE_FACES_CONFIG.map((f) => f.imageUrl);
    expect(urls.every((u) => typeof u === 'string' && u.length > 0)).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('names the six face plainly — no skull or substitute glyph, per 8.2', () => {
    const six = DICE_FACES_CONFIG.find((f) => f.value === 6);
    expect(six?.label).toBe('Six');
    expect(six?.imageUrl).toBe('/assets/dice/die-face-6.png');
  });
});
