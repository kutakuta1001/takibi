import { describe, it, expect } from 'vitest';
import { generateImpulseResponse } from '../src/audio/Reverb';

describe('generateImpulseResponse', () => {
  it('returns a buffer of length sampleRate * seconds', () => {
    const ir = generateImpulseResponse(44100, 1, 3);
    expect(ir.length).toBe(44100);

    const short = generateImpulseResponse(44100, 0.5, 5);
    expect(short.length).toBe(22050);
  });

  it('contains no NaN or non-finite values', () => {
    const ir = generateImpulseResponse(44100, 1, 3);
    for (const v of ir) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('decays monotonically in energy across the buffer (later chunks are quieter)', () => {
    const ir = generateImpulseResponse(44100, 1, 4);
    const chunkCount = 10;
    const chunkSize = Math.floor(ir.length / chunkCount);
    const rms: number[] = [];
    for (let c = 0; c < chunkCount; c++) {
      let sumSq = 0;
      for (let i = c * chunkSize; i < (c + 1) * chunkSize; i++) {
        sumSq += ir[i] * ir[i];
      }
      rms.push(Math.sqrt(sumSq / chunkSize));
    }
    for (let i = 1; i < rms.length; i++) {
      expect(rms[i]).toBeLessThan(rms[i - 1]);
    }
  });

  it('is nearly silent by the tail of the buffer for a steep decay', () => {
    const ir = generateImpulseResponse(44100, 0.5, 8);
    const tailStart = Math.floor(ir.length * 0.9);
    let maxTail = 0;
    for (let i = tailStart; i < ir.length; i++) {
      maxTail = Math.max(maxTail, Math.abs(ir[i]));
    }
    expect(maxTail).toBeLessThan(0.05);
  });
});
