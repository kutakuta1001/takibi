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

export interface TransitionResult {
  status: 'done' | 'failed' | 'ignored';
}

export interface SpotManagerOptions {
  /** fadingOut が十分進んだ時点（暗転中）で一度だけ発火する音フック。第3引数が関数の場合はこれと同義。 */
  onApproach?: (target: Spot) => void;
  /**
   * 遷移先の準備を待つフック（例: PanoScene.load()）。fadeOut のアニメーション時間と並行して走らせ、
   * fadeOut 完了後もまだ終わっていなければ完了を待つ。reject した場合は遷移を中断し出発地に留まる
   * （現在地は変えず、TransitionResult.status を 'failed' にして即座に busy を解除する）。
   */
  prepare?: (id: Spot['id']) => Promise<void>;
}

type PrepareState = 'pending' | 'ready';

interface PendingTransition {
  target: Spot;
  resolve: (result: TransitionResult) => void;
  approached: boolean;
  prepareState: PrepareState;
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
  private readonly onApproach?: (target: Spot) => void;
  private readonly prepare?: (id: Spot['id']) => Promise<void>;

  constructor(
    private readonly spots: Spot[],
    private readonly onApply: (spot: Spot) => void,
    onApproachOrOptions?: ((target: Spot) => void) | SpotManagerOptions
  ) {
    if (spots.length === 0) {
      throw new Error('SpotManager には最低1つの Spot が必要');
    }
    this.currentSpot = spots[0];

    // 第3引数は関数（旧: onApproach 単体）と opts オブジェクト（新: { onApproach?, prepare? }）の
    // どちらでも受け取れるようにする（後方互換）。
    if (typeof onApproachOrOptions === 'function') {
      this.onApproach = onApproachOrOptions;
    } else if (onApproachOrOptions) {
      this.onApproach = onApproachOrOptions.onApproach;
      this.prepare = onApproachOrOptions.prepare;
    }
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

  /**
   * 暗転が完了しているのに、まだ prepare（例: PanoScene.load()）の完了を待っている状態。
   * main.ts はこれを見て HUD に「向かっている…」を表示する。
   */
  get pendingPrepare(): boolean {
    return (
      this.state === 'fadingOut' &&
      this.elapsed >= FADE_OUT_SECONDS &&
      this.pending !== null &&
      this.pending.prepareState === 'pending'
    );
  }

  transitionTo(id: Spot['id']): Promise<TransitionResult> {
    if (this.busy) return Promise.resolve({ status: 'ignored' });
    if (id === this.currentSpot.id) return Promise.resolve({ status: 'ignored' });
    if (!this.currentSpot.destinations.includes(id)) return Promise.resolve({ status: 'ignored' });

    const target = this.spots.find((s) => s.id === id);
    if (!target) return Promise.resolve({ status: 'ignored' });

    return new Promise((resolve) => {
      this.state = 'fadingOut';
      this.elapsed = 0;
      // prepare が指定されていない呼び方（既存の使い方）は最初から 'ready' にしておく。
      // これにより、prepare を使わない限りタイミングは従来どおり update(dt) のみで決まる。
      const pending: PendingTransition = {
        target,
        resolve,
        approached: false,
        prepareState: this.prepare ? 'pending' : 'ready',
      };
      this.pending = pending;

      if (this.prepare) {
        this.prepare(id).then(
          () => {
            if (this.pending === pending) {
              pending.prepareState = 'ready';
            }
          },
          () => {
            // 準備に失敗: 暗転を解除して出発地に留まる。ネットワーク越しの失敗はいつ届くか
            // 分からないため、fadeOut のアニメーション時間を待たせず即座に確定する。
            if (this.pending === pending) {
              this.pending = null;
              this.state = 'idle';
              this.elapsed = 0;
              resolve({ status: 'failed' });
            }
          }
        );
      }
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

      // prepare が終わっていなければ、暗転(fadeOpacity=1)を保ったまま待つ
      // （pendingPrepare を見て main.ts が「向かっている…」を表示する）。
      if (pending && this.elapsed >= FADE_OUT_SECONDS && pending.prepareState === 'ready') {
        this.currentSpot = pending.target;
        this.onApply(pending.target);
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
      pending?.resolve({ status: 'done' });
    }
  }
}
