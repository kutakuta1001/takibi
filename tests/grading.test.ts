import { describe, it, expect } from 'vitest';
import { Grading } from '../src/pano/Grading';

describe('Grading', () => {
  it('starts at full dayness (dusk, base photo as-is)', () => {
    const g = new Grading();
    expect(g.dayness).toBeCloseTo(1);
  });

  it('reaches minimum dayness (night) at the midpoint of the 10-minute cycle', () => {
    const g = new Grading();
    g.update(300);
    expect(g.dayness).toBeCloseTo(0);
  });

  it('returns to full dayness after a full cycle', () => {
    const g = new Grading();
    g.update(600);
    expect(g.dayness).toBeCloseTo(1);
  });

  it('keeps looping indefinitely via time wraparound', () => {
    const g = new Grading();
    g.update(600 + 300);
    expect(g.dayness).toBeCloseTo(0);
  });

  it('is symmetric around the midpoint (dusk -> night -> dusk)', () => {
    const g = new Grading();
    g.update(150);
    const beforeMidpoint = g.dayness;
    g.update(300); // t=450, 中間(300)から150進んだ対称点
    const afterMidpoint = g.dayness;
    expect(afterMidpoint).toBeCloseTo(beforeMidpoint);
  });
});
