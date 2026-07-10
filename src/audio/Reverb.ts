import Alea from 'alea';

/**
 * ノイズ+指数減衰の手続きインパルスレスポンス生成（畳み込みリバーブ用）。
 * 決定的（固定シード）にすることで、テストが乱数依存で不安定にならないようにする。
 */
export function generateImpulseResponse(sampleRate: number, seconds: number, decay: number): Float32Array {
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const data = new Float32Array(length);
  const rand = Alea('takibi-reverb-ir');
  for (let i = 0; i < length; i++) {
    const t = i / length; // 0..1（バッファ全体に対する相対位置）
    const envelope = Math.exp(-decay * t);
    data[i] = (rand() * 2 - 1) * envelope;
  }
  return data;
}

export interface ReverbPreset {
  seconds: number;
  decay: number;
  wet: number;
}

/**
 * スポットごとの残響プリセット。CEO確定の品質原則「効果として気づかれたら強すぎる」に基づき、
 * wet（リバーブ成分の混合比）はいずれも控えめに抑える（迷ったら弱く）。
 */
export const REVERB_PRESETS: Record<'campsite' | 'riverside' | 'snowfield', ReverbPreset> = {
  campsite: { seconds: 1.2, decay: 3.0, wet: 0.16 }, // 原生林。柔らかく短い残響
  riverside: { seconds: 2.6, decay: 2.2, wet: 0.28 }, // 渓谷。岩壁の反響が主役
  snowfield: { seconds: 0.5, decay: 5.0, wet: 0.05 }, // 雪山。雪の吸音でほぼ無響の静寂
};

const DEFAULT_FADE_SECONDS = 1.5;

/**
 * 手続き生成のIRを使うConvolverNodeベースのリバーブ。dry音は呼び出し側が別経路で
 * master へ直結し続け、このReverbはwet（リバーブ成分のみ）のsend-return経路を担う。
 * apply() のたびにConvolverのバッファを差し替えるため、瞬間的な不連続が生じ得るが、
 * スポット遷移の暗転中（SpotManager.onApply のタイミング）に呼ぶ運用なので聴感上は問題にならない。
 */
export class Reverb {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.normalize = false; // 生成したIRの振幅を自前で制御するため、自動正規化を無効化
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;

    this.input.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  /** プリセットのIRに差し替え、wetゲインを fadeSeconds かけて目標値へ補間する。 */
  apply(preset: ReverbPreset, fadeSeconds: number = DEFAULT_FADE_SECONDS): void {
    const buffer = this.ctx.createBuffer(
      1,
      Math.max(1, Math.floor(this.ctx.sampleRate * preset.seconds)),
      this.ctx.sampleRate
    );
    buffer.getChannelData(0).set(generateImpulseResponse(this.ctx.sampleRate, preset.seconds, preset.decay));
    this.convolver.buffer = buffer;

    const now = this.ctx.currentTime;
    this.wetGain.gain.cancelScheduledValues(now);
    this.wetGain.gain.setValueAtTime(this.wetGain.gain.value, now);
    this.wetGain.gain.linearRampToValueAtTime(preset.wet, now + Math.max(fadeSeconds, 0.001));
  }
}
