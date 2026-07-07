export interface Synth {
  output: AudioNode;
  setIntensity(v: number): void;
}

const BIRD_ACTIVE_THRESHOLD = 0.4; // dayness がこれを超えたら鳴く
const INSECT_ACTIVE_THRESHOLD = 0.3; // dayness がこれを下回ったら鳴く
const BIRD_INTERVAL_MIN_MS = 8000;
const BIRD_INTERVAL_MAX_MS = 12000;
const INSECT_PULSE_MIN_MS = 150;
const INSECT_PULSE_MAX_MS = 250;

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createLoopingNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, 2);
  source.loop = true;
  source.start();
  return source;
}

/** 風: ホワイトノイズ→ローパス400Hz。ゲインを0.05Hzの LFO でゆらす。 */
export function createWind(ctx: AudioContext): Synth {
  const source = createLoopingNoiseSource(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;

  const gain = ctx.createGain();
  gain.gain.value = 0.3;

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.08;
  lfo.connect(lfoGain).connect(gain.gain);
  lfo.start();

  source.connect(filter).connect(gain);

  return {
    output: gain,
    setIntensity(v: number) {
      gain.gain.value = 0.3 * v;
    },
  };
}

/** 川: ノイズ→バンドパス800Hz Q=0.8。setIntensity は距離ゲインとして直接反映。 */
export function createRiver(ctx: AudioContext): Synth {
  const source = createLoopingNoiseSource(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  source.connect(filter).connect(gain);

  return {
    output: gain,
    setIntensity(v: number) {
      gain.gain.value = v;
    },
  };
}

/** 単発の FM チャープ（鳥の一音）を startTime に鳴らす。 */
function playFmChirp(ctx: AudioContext, dest: AudioNode, startTime: number): void {
  const baseFreq = 2000 + Math.random() * 2000;

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = baseFreq;

  const modulator = ctx.createOscillator();
  modulator.type = 'sine';
  modulator.frequency.value = 40 + Math.random() * 40;
  const modGain = ctx.createGain();
  modGain.gain.value = baseFreq * 0.5;
  modulator.connect(modGain).connect(carrier.frequency);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(0.6, startTime + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.001, startTime + 0.13);

  carrier.connect(envelope).connect(dest);
  carrier.start(startTime);
  modulator.start(startTime);
  carrier.stop(startTime + 0.15);
  modulator.stop(startTime + 0.15);
}

/** 鳥: 8〜20秒ランダム間隔でFMチャープ2〜4音。dayness>0.4のときのみ鳴く。 */
export function createBirds(ctx: AudioContext): Synth {
  const output = ctx.createGain();
  output.gain.value = 0.5;
  let active = false;

  function scheduleNext(): void {
    const delay = BIRD_INTERVAL_MIN_MS + Math.random() * (BIRD_INTERVAL_MAX_MS - BIRD_INTERVAL_MIN_MS);
    setTimeout(() => {
      if (active) {
        const noteCount = 2 + Math.floor(Math.random() * 3); // 2〜4音
        let t = ctx.currentTime;
        for (let i = 0; i < noteCount; i++) {
          playFmChirp(ctx, output, t);
          t += 0.12 + Math.random() * 0.08;
        }
      }
      scheduleNext();
    }, delay);
  }
  scheduleNext();

  return {
    output,
    setIntensity(v: number) {
      active = v > BIRD_ACTIVE_THRESHOLD;
    },
  };
}

/** 虫: 高域ノイズのパルス列。dayness<0.3のときのみ鳴く。 */
export function createInsects(ctx: AudioContext): Synth {
  const output = ctx.createGain();
  output.gain.value = 0.25;
  let active = false;

  const source = createLoopingNoiseSource(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 4000;

  const pulseGain = ctx.createGain();
  pulseGain.gain.value = 0;
  source.connect(filter).connect(pulseGain).connect(output);

  function pulse(): void {
    if (active) {
      const now = ctx.currentTime;
      pulseGain.gain.cancelScheduledValues(now);
      pulseGain.gain.setValueAtTime(0, now);
      pulseGain.gain.linearRampToValueAtTime(1, now + 0.02);
      pulseGain.gain.linearRampToValueAtTime(0, now + 0.08);
    }
    setTimeout(pulse, INSECT_PULSE_MIN_MS + Math.random() * (INSECT_PULSE_MAX_MS - INSECT_PULSE_MIN_MS));
  }
  pulse();

  return {
    output,
    setIntensity(v: number) {
      active = v < INSECT_ACTIVE_THRESHOLD;
    },
  };
}

const FIRE_CRACKLE_MIN_INTERVAL_MS = 80;
const FIRE_CRACKLE_MAX_INTERVAL_MS = 600;
const FIRE_CRACKLE_IDLE_CHECK_MS = 500; // intensity=0のときの再チェック間隔

/** 焚き火のパチパチ音: ランダム間隔のバンドパスノイズバースト（30〜80ms）。setIntensityでレートとゲインが変わる。 */
export function createFireCrackle(ctx: AudioContext): Synth {
  const output = ctx.createGain();
  output.gain.value = 0;
  let intensity = 0;

  function scheduleNext(): void {
    const delay =
      intensity > 0
        ? (FIRE_CRACKLE_MIN_INTERVAL_MS +
            Math.random() * (FIRE_CRACKLE_MAX_INTERVAL_MS - FIRE_CRACKLE_MIN_INTERVAL_MS)) /
          Math.max(intensity, 0.1)
        : FIRE_CRACKLE_IDLE_CHECK_MS;

    setTimeout(() => {
      if (intensity > 0) {
        playNoiseBurst(ctx, output, {
          duration: 0.03 + Math.random() * 0.05,
          filterType: 'bandpass',
          filterFreq: 1000 + Math.random() * 1000,
          q: 2,
          peakGain: 0.4 + intensity * 0.5,
        });
      }
      scheduleNext();
    }, delay);
  }
  scheduleNext();

  return {
    output,
    setIntensity(v: number) {
      intensity = Math.max(0, Math.min(v, 1));
      output.gain.value = 0.4 + intensity * 0.6;
    },
  };
}

interface NoiseBurstOptions {
  duration: number;
  filterType: BiquadFilterType;
  filterFreq: number;
  peakGain: number;
  q?: number;
}

function playNoiseBurst(ctx: AudioContext, dest: AudioNode, options: NoiseBurstOptions): void {
  const now = ctx.currentTime;

  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, options.duration);

  const filter = ctx.createBiquadFilter();
  filter.type = options.filterType;
  filter.frequency.value = options.filterFreq;
  if (options.q !== undefined) {
    filter.Q.value = options.q;
  }

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(options.peakGain, now + 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.001, now + options.duration);

  source.connect(filter).connect(envelope).connect(dest);
  source.start(now);
  source.stop(now + options.duration);
}

/** 斧が木にヒットする音。 */
export function playChop(ctx: AudioContext, dest: AudioNode): void {
  playNoiseBurst(ctx, dest, { duration: 0.12, filterType: 'bandpass', filterFreq: 900, q: 1.2, peakGain: 0.9 });
}

/** 木が倒れる音（低域のドスンに続き枝葉のガサッという高域）。 */
export function playTreeFall(ctx: AudioContext, dest: AudioNode): void {
  playNoiseBurst(ctx, dest, { duration: 0.6, filterType: 'lowpass', filterFreq: 300, peakGain: 0.8 });
  setTimeout(() => {
    playNoiseBurst(ctx, dest, { duration: 0.3, filterType: 'highpass', filterFreq: 2000, peakGain: 0.4 });
  }, 80);
}

/** 薪を拾う音。 */
export function playPickup(ctx: AudioContext, dest: AudioNode): void {
  playNoiseBurst(ctx, dest, { duration: 0.08, filterType: 'highpass', filterFreq: 1500, peakGain: 0.5 });
}

/** ケトルに水を汲む音。 */
export function playWaterFill(ctx: AudioContext, dest: AudioNode): void {
  playNoiseBurst(ctx, dest, { duration: 0.8, filterType: 'bandpass', filterFreq: 1200, q: 0.6, peakGain: 0.6 });
}

/** コーヒーをすする音。 */
export function playSip(ctx: AudioContext, dest: AudioNode): void {
  playNoiseBurst(ctx, dest, { duration: 0.35, filterType: 'bandpass', filterFreq: 600, q: 1.5, peakGain: 0.5 });
}
