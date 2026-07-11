import { describe, it, expect } from 'vitest';
import { PauseGate } from '../src/core/PauseGate';

describe('PauseGate', () => {
  it('returns null while paused and clamps the first dt after resume', () => {
    const gate = new PauseGate();
    gate.paused = true;
    expect(gate.filter(5)).toBeNull();
    gate.paused = false;
    expect(gate.filter(5)).toBe(0.1); // 裏タブ中の巨大 dt を持ち込まない
    expect(gate.filter(0.016)).toBe(0.016);
  });

  it('passes dt through unchanged when never paused', () => {
    const gate = new PauseGate();
    expect(gate.filter(0.016)).toBe(0.016);
    expect(gate.filter(0.02)).toBe(0.02);
  });

  it('clamps again after a second pause/resume cycle', () => {
    const gate = new PauseGate();
    gate.paused = true;
    expect(gate.filter(3)).toBeNull();
    gate.paused = false;
    expect(gate.filter(0.016)).toBe(0.1);
    expect(gate.filter(0.016)).toBe(0.016);

    gate.paused = true;
    expect(gate.filter(10)).toBeNull();
    gate.paused = false;
    expect(gate.filter(0.02)).toBe(0.1);
    expect(gate.filter(0.02)).toBe(0.02);
  });
});
