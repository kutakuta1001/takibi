// タブが裏に回っている間、requestAnimationFrame は極端に間引かれる（ブラウザによっては
// ほぼ止まる）ため、復帰直後の1フレームだけ実時間換算で巨大な dt が来ることがある。
// これをそのままシミュレーションに渡すと、薪の燃焼や抽出の進行が裏で溜め込んだ分だけ
// 一気に進んでしまう。RESUME_DT_CLAMP はその1フレームだけ通常フレーム相当の値に抑える。
const RESUME_DT_CLAMP = 0.1;

/**
 * タブ非表示中はシミュレーション更新を止めるための単純なゲート。DOM に依存せず、
 * `paused` の切り替えは呼び出し側（main.ts の visibilitychange ハンドラ）が行う。
 * GameState.ts 自体は変更しない（一時停止は呼び出し側で filter(dt) が null を返すことで
 * update呼び出し自体をスキップさせる方式）。
 */
export class PauseGate {
  paused = false;
  private justResumed = false;

  /**
   * paused 中は null を返す（呼び出し側は今フレームの更新を全てスキップする）。
   * paused から復帰した直後の最初の呼び出しだけ、dt を RESUME_DT_CLAMP に差し替える。
   */
  filter(dt: number): number | null {
    if (this.paused) {
      this.justResumed = true;
      return null;
    }
    if (this.justResumed) {
      this.justResumed = false;
      return RESUME_DT_CLAMP;
    }
    return dt;
  }
}
