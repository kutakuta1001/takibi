export interface SpotAudioMix {
  wind: number;
  river: number;
  birds: boolean;
  insects: boolean;
}

export interface Spot {
  id: 'campsite' | 'riverside';
  panoUrl: string;
  audioMix: SpotAudioMix;
}

type TransitionState = 'idle' | 'fadingOut' | 'fadingIn';

const FADE_OUT_SECONDS = 0.75;
const FADE_IN_SECONDS = 0.75;

interface PendingTransition {
  target: Spot;
  resolve: () => void;
}

/**
 * スポット（campsite / riverside）間のクロスフェード遷移を管理する状態機械
 * （idle → fadingOut → fadingIn → idle）。DOM に依存せず、フェードの進行は
 * update(dt) で駆動する。暗転オーバーレイの描画・実際のパノラマ/音声の切替は
 * onApply コールバック経由で main.ts 側が担う。busy 中の transitionTo は無視する。
 */
export class SpotManager {
  private state: TransitionState = 'idle';
  private currentSpot: Spot;
  private elapsed = 0;
  private pending: PendingTransition | null = null;

  constructor(
    private readonly spots: Spot[],
    private readonly onApply: (spot: Spot) => void
  ) {
    if (spots.length === 0) {
      throw new Error('SpotManager には最低1つの Spot が必要');
    }
    this.currentSpot = spots[0];
  }

  get current(): Spot['id'] {
    return this.currentSpot.id;
  }

  get busy(): boolean {
    return this.state !== 'idle';
  }

  /** フェードオーバーレイの不透明度（0=見えない、1=完全に覆われている）。白寄りのやわらかい暗転を想定。 */
  get fadeOpacity(): number {
    if (this.state === 'fadingOut') return Math.min(this.elapsed / FADE_OUT_SECONDS, 1);
    if (this.state === 'fadingIn') return Math.max(1 - this.elapsed / FADE_IN_SECONDS, 0);
    return 0;
  }

  transitionTo(id: Spot['id']): Promise<void> {
    if (this.busy) return Promise.resolve();
    if (id === this.currentSpot.id) return Promise.resolve();

    const target = this.spots.find((s) => s.id === id);
    if (!target) return Promise.resolve();

    return new Promise((resolve) => {
      this.state = 'fadingOut';
      this.elapsed = 0;
      this.pending = { target, resolve };
    });
  }

  update(dt: number): void {
    if (this.state === 'idle') return;
    this.elapsed += dt;

    if (this.state === 'fadingOut' && this.elapsed >= FADE_OUT_SECONDS) {
      const pending = this.pending;
      if (pending) {
        this.currentSpot = pending.target;
        this.onApply(pending.target);
      }
      this.state = 'fadingIn';
      this.elapsed = 0;
      return;
    }

    if (this.state === 'fadingIn' && this.elapsed >= FADE_IN_SECONDS) {
      const pending = this.pending;
      this.state = 'idle';
      this.elapsed = 0;
      this.pending = null;
      pending?.resolve();
    }
  }
}
