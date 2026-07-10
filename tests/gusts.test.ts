import { describe, it, expect } from 'vitest';
import { Gusts } from '../src/pano/Gusts';

describe('Gusts', () => {
  it('keeps strength within [0, 1] over a long time span', () => {
    const gusts = new Gusts('test-seed-a');
    for (let i = 0; i < 2000; i++) {
      gusts.update(0.1);
      const s = gusts.strength;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('varies over time rather than staying constant', () => {
    const gusts = new Gusts('test-seed-b');
    const samples: number[] = [];
    for (let i = 0; i < 600; i++) {
      gusts.update(0.1);
      samples.push(gusts.strength);
    }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(0.05);
  });

  it('hovers around a base level near 0.3 on average', () => {
    const gusts = new Gusts('test-seed-c');
    let sum = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      gusts.update(0.1);
      sum += gusts.strength;
    }
    const avg = sum / n;
    expect(avg).toBeGreaterThan(0.15);
    expect(avg).toBeLessThan(0.55);
  });

  it('occasionally bursts above 0.8 (gusts) within a 10-minute span', () => {
    const gusts = new Gusts('test-seed-d');
    let maxSeen = 0;
    for (let i = 0; i < 6000; i++) {
      gusts.update(0.1); // 600秒（10分）分サンプル
      maxSeen = Math.max(maxSeen, gusts.strength);
    }
    expect(maxSeen).toBeGreaterThan(0.8);
  });

  it('is deterministic for a given seed', () => {
    const a = new Gusts('same-seed');
    const b = new Gusts('same-seed');
    for (let i = 0; i < 50; i++) {
      a.update(0.1);
      b.update(0.1);
      expect(a.strength).toBeCloseTo(b.strength, 10);
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = new Gusts('seed-one');
    const b = new Gusts('seed-two');
    let differed = false;
    for (let i = 0; i < 50; i++) {
      a.update(0.1);
      b.update(0.1);
      if (Math.abs(a.strength - b.strength) > 1e-6) differed = true;
    }
    expect(differed).toBe(true);
  });
});
