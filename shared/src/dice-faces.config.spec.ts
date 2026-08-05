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

  it('has no image configured yet — renderers must fall back to a placeholder (Phase 4 without art)', () => {
    expect(DICE_FACES_CONFIG.every((f) => !f.imageUrl)).toBe(true);
  });
});
