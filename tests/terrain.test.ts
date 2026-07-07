import { describe, it, expect } from 'vitest';
import { Terrain } from '../src/world/Terrain';

describe('Terrain', () => {
  it('is deterministic for the fixed seed', () => {
    const a = new Terrain();
    const b = new Terrain();
    expect(a.heightAt(10, 10)).toBeCloseTo(b.heightAt(10, 10), 10);
  });
  it('carves the river lower than its banks', () => {
    const t = new Terrain();
    expect(t.heightAt(30, 0)).toBeLessThan(t.heightAt(50, 0) - 1.0);
  });
  it('detects river zone', () => {
    const t = new Terrain();
    expect(t.isInRiver(30, 5)).toBe(true);
    expect(t.isInRiver(0, 0)).toBe(false);
  });
});
