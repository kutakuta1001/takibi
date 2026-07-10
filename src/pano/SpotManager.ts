export interface SpotAudioMix {
  wind: number;
  river: number;
  birds: boolean;
  insects: boolean;
}

export interface Spot {
  id: 'campsite' | 'riverside' | 'snowfield';
  panoUrl: string;
  audioMix: SpotAudioMix;
  snowfall: boolean; // snowfield のみ true。main.ts が Snowfall.setEnabled に渡す
  destinations: Spot['id'][]; // ハブ&スポーク遷移の許可先（ナビUIのボタン生成にも使う）
}

type TransitionState = 'idle' | 'fadingOut' | 'fadingIn';

// 「旅する遷移」（Phase U）に合わせ 1.5→2.6 秒へ拡張。フェードアウト中に出発地の足音、
// フェードイン開始時に到着地の足音を鳴らす余地を持たせる。
const FADE_OUT_SECONDS = 1.1;
const FADE_IN_SECONDS = 1.5;
// フェードアウト完了のこれだけ手前で onApproach を発火する（画面が十分暗くなった頃合いで、
// 到着地の環境音を先行フェードインさせるため。「姿より先に音が到着する」体験のコア）。
const AMBIENCE_LEAD_SECONDS = 0.4;

interface PendingTransition {
  target: Spot;
  resolve: () => void;
  approached: boolean;
}

/**
 * スポット（campsite / riverside / snowfield）間のクロスフェード遷移を管理する状態機械
 * （idle → fadingOut → fadingIn → idle）。DOM に依存せず、フェードの進行は
 * update(dt) で駆動する。暗転オーバーレイの描画・実際のパノラマ/音声の切替は
 * onApply コールバック経由で main.ts 側が担う。busy 中の transitionTo は無視する。
 * ハブ&スポーク構成のため、現在スポットの destinations に含まれない遷移も無視する
 * （例: riverside → snowfield は不可。campsite を経由する必要がある）。
 * onApproach は fadingOut が十分進んだ時点（暗転中）で一度だけ発火する音フック
 * （main.ts が到着地の環境音を先行フェードインさせるために使う。onApply より前に呼ばれる）。
 */
export class SpotManager {
  private state: TransitionState = 'idle';
  private currentSpot: Spot;
  private elapsed = 0;
  private pending: PendingTransition | null = null;

  constructor(
    private readonly spots: Spot[],
    private readonly onApply: (spot: Spot) => void,
    private readonly onApproach?: (target: Spot) => void
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
    if (!this.currentSpot.destinations.includes(id)) return Promise.resolve();

    const target = this.spots.find((s) => s.id === id);
    if (!target) return Promise.resolve();

    return new Promise((resolve) => {
      this.state = 'fadingOut';
      this.elapsed = 0;
      this.pending = { target, resolve, approached: false };
    });
  }

  update(dt: number): void {
    if (this.state === 'idle') return;
    this.elapsed += dt;

    if (this.state === 'fadingOut') {
      const pending = this.pending;
      if (pending && !pending.approached && this.elapsed >= FADE_OUT_SECONDS - AMBIENCE_LEAD_SECONDS) {
        pending.approached = true;
        this.onApproach?.(pending.target);
      }

      if (this.elapsed >= FADE_OUT_SECONDS) {
        if (pending) {
          this.currentSpot = pending.target;
          this.onApply(pending.target);
        }
        this.state = 'fadingIn';
        this.elapsed = 0;
      }
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
