import Alea from 'alea';
import { createNoise2D } from 'simplex-noise';

const BASE_STRENGTH = 0.3; // 基礎風の中心値
const SLOW_TIME_SCALE = 1 / 32; // 数十秒スケールでゆっくり波打つ本体
const SLOW_AMPLITUDE = 0.2;
const GUST_TIME_SCALE = 1 / 6; // 本体より速く、時折の突風の立ち上がりを作る層
const GUST_AMPLITUDE = 0.6;
const GUST_POWER = 3; // 正の高いピークだけを急激に強調し、大半の時間は突風にならないようにする
const DEFAULT_SEED = 'takibi-gusts';

/**
 * 風の突風サイクル（数十秒周期のゆっくりした強弱 + 時折の突風）。
 * simplex noiseの2層合成: 遅い成分が基礎風0.3前後をゆっくり揺らし、速い成分の正のピークだけを
 * 累乗で強調することで、めったに起きない短い突風（0.8超）を自然に作る。DOM/Three.js非依存。
 */
export class Gusts {
  private time = 0;
  private readonly slowNoise: (x: number, y: number) => number;
  private readonly gustNoise: (x: number, y: number) => number;

  constructor(seed: string = DEFAULT_SEED) {
    this.slowNoise = createNoise2D(Alea(seed, 'slow'));
    this.gustNoise = createNoise2D(Alea(seed, 'gust'));
  }

  update(dt: number): void {
    this.time += dt;
  }

  get strength(): number {
    const slow = this.slowNoise(this.time * SLOW_TIME_SCALE, 0); // -1..1
    const gust = this.gustNoise(this.time * GUST_TIME_SCALE, 0); // -1..1
    const gustPulse = Math.pow(Math.max(0, gust), GUST_POWER); // 0..1（高いピークのみ強調）

    const raw = BASE_STRENGTH + slow * SLOW_AMPLITUDE + gustPulse * GUST_AMPLITUDE;
    return Math.max(0, Math.min(1, raw));
  }
}
