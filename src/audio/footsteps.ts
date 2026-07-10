export type Ground = 'grass' | 'rock' | 'snow';

const STEP_INTERVAL_SECONDS = 0.55;
const STEP_INTERVAL_JITTER = 0.1; // ±10%

interface NoiseBurstOptions {
  duration: number;
  filterType: BiquadFilterType;
  filterFreq: number;
  peakGain: number;
  q?: number;
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function playNoiseBurstAt(ctx: AudioContext, dest: AudioNode, startTime: number, options: NoiseBurstOptions): void {
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, options.duration);

  const filter = ctx.createBiquadFilter();
  filter.type = options.filterType;
  filter.frequency.value = options.filterFreq;
  if (options.q !== undefined) {
    filter.Q.value = options.q;
  }

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(options.peakGain, startTime + 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.001, startTime + options.duration);

  source.connect(filter).connect(envelope).connect(dest);
  source.start(startTime);
  source.stop(startTime + options.duration);
}

/** 1歩分の足音を startTime に鳴らす。地面ごとに音色を変える。 */
function playSingleStep(ctx: AudioContext, dest: AudioNode, ground: Ground, startTime: number): void {
  switch (ground) {
    case 'grass':
      // 草地: こもった低域のノイズ
      playNoiseBurstAt(ctx, dest, startTime, {
        duration: 0.14,
        filterType: 'lowpass',
        filterFreq: 500,
        peakGain: 0.35,
      });
      break;
    case 'rock':
      // 岩場: 硬いコツッという短い減衰
      playNoiseBurstAt(ctx, dest, startTime, {
        duration: 0.08,
        filterType: 'bandpass',
        filterFreq: 1200,
        q: 3,
        peakGain: 0.4,
      });
      break;
    case 'snow':
      // 雪: 圧雪のきゅっという2連ノイズ
      playNoiseBurstAt(ctx, dest, startTime, {
        duration: 0.05,
        filterType: 'highpass',
        filterFreq: 2000,
        peakGain: 0.3,
      });
      playNoiseBurstAt(ctx, dest, startTime + 0.04, {
        duration: 0.05,
        filterType: 'highpass',
        filterFreq: 2600,
        peakGain: 0.22,
      });
      break;
  }
}

/**
 * steps 歩分の足音を、歩幅間隔0.55秒±10%で鳴らす（SpotManagerの遷移フェードに乗せる想定）。
 * 地面ごとに音色を切り替える: grass=低域こもり / rock=硬いコツ / snow=圧雪の2連ノイズ。
 */
export function playFootsteps(ctx: AudioContext, dest: AudioNode, ground: Ground, steps: number): void {
  let t = ctx.currentTime;
  for (let i = 0; i < steps; i++) {
    playSingleStep(ctx, dest, ground, t);
    const jitter = 1 + (Math.random() * 2 - 1) * STEP_INTERVAL_JITTER;
    t += STEP_INTERVAL_SECONDS * jitter;
  }
}
