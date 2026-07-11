import { describe, expect, it } from 'vitest';
import { buildStarLuminanceMask, directionToEquirectPixel, sampleLuminance } from '../src/pano/StarMask';

describe('directionToEquirectPixel', () => {
  const width = 256;
  const height = 128;

  it('maps straight up (zenith) to the top row', () => {
    const { row } = directionToEquirectPixel({ x: 0, y: 1, z: 0 }, width, height);
    expect(row).toBe(0);
  });

  it('maps straight down (nadir) to the bottom row', () => {
    const { row } = directionToEquirectPixel({ x: 0, y: -1, z: 0 }, width, height);
    expect(row).toBe(height - 1);
  });

  it('maps horizon directions to the middle row', () => {
    const { row } = directionToEquirectPixel({ x: 1, y: 0, z: 0 }, width, height);
    expect(row).toBe(Math.floor(height / 2));
  });

  it('wraps azimuth around the full column range', () => {
    const front = directionToEquirectPixel({ x: 1, y: 0, z: 0 }, width, height);
    const right = directionToEquirectPixel({ x: 0, y: 0, z: 1 }, width, height);
    const back = directionToEquirectPixel({ x: -1, y: 0, z: 0 }, width, height);
    const left = directionToEquirectPixel({ x: 0, y: 0, z: -1 }, width, height);
    expect(front.col).toBe(0);
    expect(right.col).toBe(Math.floor(width * 0.25));
    expect(back.col).toBe(Math.floor(width * 0.5));
    expect(left.col).toBe(Math.floor(width * 0.75));
  });
});

describe('sampleLuminance', () => {
  it('reads full white as luminance 1', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(sampleLuminance(pixels, 1, 0, 0)).toBeCloseTo(1, 5);
  });

  it('reads full black as luminance 0', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255]);
    expect(sampleLuminance(pixels, 1, 0, 0)).toBeCloseTo(0, 5);
  });
});

describe('buildStarLuminanceMask', () => {
  // 2x2画像: 上段(row0)は明るい空、下段(row1)は暗い樹冠を模す。
  const width = 2;
  const height = 2;
  // prettier-ignore
  const pixels = new Uint8ClampedArray([
    255, 255, 255, 255,   255, 255, 255, 255, // row 0: 空(明るい)
    10, 10, 10, 255,      10, 10, 10, 255,    // row 1: 樹冠(暗い)
  ]);

  it('keeps stars pointing at bright sky pixels visible', () => {
    const mask = buildStarLuminanceMask(pixels, width, height, [{ x: 0, y: 1, z: 0 }]);
    expect(mask[0]).toBeCloseTo(1, 5);
  });

  it('hides stars pointing at dark canopy pixels', () => {
    const mask = buildStarLuminanceMask(pixels, width, height, [{ x: 0, y: -1, z: 0 }]);
    expect(mask[0]).toBeCloseTo(0, 5);
  });
});
