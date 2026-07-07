const CYCLE_SECONDS = 600; // 10分周期で夕⇔夜をループ

function computeDayness(time: number, cycleSeconds: number): number {
  const angle = (time / cycleSeconds) * Math.PI * 2;
  return (Math.cos(angle) + 1) / 2;
}

/**
 * 夕⇔夜の色調ループを進める（DOM/Three.js非依存）。ベース写真はゴールデンアワーのため、
 * dayness=1（サイクル開始・t=0）でベース写真そのまま、dayness=0（サイクル中間・t=cycle/2）で
 * 最も暗い夜、dayness=1（サイクル終端・t=cycle）で再び夕方へ戻る滑らかな余弦カーブ。
 * PanoScene.setGrading / 焚き火の光の存在感 / 鳥(夕)・虫(夜)の切替は main.ts が dayness を見て接続する。
 */
export class Grading {
  private time = 0;

  update(dt: number): void {
    this.time = (this.time + dt) % CYCLE_SECONDS;
  }

  get dayness(): number {
    return computeDayness(this.time, CYCLE_SECONDS);
  }
}
