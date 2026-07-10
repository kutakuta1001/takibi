/**
 * 無操作（idle）検出のロジック（DOM非依存）。マウス移動・キー入力等の実際のDOMイベントは
 * main.ts側でリスンし、activity() を呼ぶことでこのクラスに伝える。
 * idleSeconds 以上 activity() が呼ばれない状態が続くと idle になり、onChange に通知する。
 */
export class IdleWatcher {
  private elapsed = 0;
  private _idle = false;
  private readonly listeners: Array<(idle: boolean) => void> = [];

  constructor(private readonly idleSeconds: number) {}

  get idle(): boolean {
    return this._idle;
  }

  /** マウス移動・キー入力など、ユーザーの操作があったときに呼ぶ。タイマーをリセットする。 */
  activity(): void {
    this.elapsed = 0;
    this.setIdle(false);
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed >= this.idleSeconds) {
      this.setIdle(true);
    }
  }

  onChange(cb: (idle: boolean) => void): void {
    this.listeners.push(cb);
  }

  private setIdle(value: boolean): void {
    if (this._idle === value) return;
    this._idle = value;
    for (const cb of this.listeners) {
      cb(value);
    }
  }
}
