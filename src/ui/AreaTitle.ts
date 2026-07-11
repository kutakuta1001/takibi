const HOLD_SECONDS = 3.5; // 全体表示は約5秒（HOLD+FADE）を狙う
const FADE_OUT_SECONDS = 1.5; // 「ゆっくりフェードアウト」= 他UIのIDLE_FADE_OUT_SECONDSと同じ基準
const FADE_IN_SECONDS = 0.4;

/**
 * スポット到着時（開始直後・遷移完了時）に画面上部中央へ場所名 + 次の一歩を表示するタイトルカード。
 * IdleWatcher の消灯対象外（表示中は自身のタイマーで出し切る。main.ts はここに接続しない）。
 */
export class AreaTitle {
  private readonly element: HTMLDivElement;
  private readonly nameEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private hideTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.style.position = 'fixed';
    this.element.style.top = '8%';
    this.element.style.left = '50%';
    this.element.style.transform = 'translateX(-50%)';
    this.element.style.textAlign = 'center';
    this.element.style.pointerEvents = 'none';
    this.element.style.opacity = '0';
    this.element.style.transition = `opacity ${FADE_IN_SECONDS}s ease`;

    this.nameEl = document.createElement('div');
    this.nameEl.style.color = '#fff';
    this.nameEl.style.fontFamily = 'sans-serif';
    this.nameEl.style.fontSize = '1.5rem';
    this.nameEl.style.letterSpacing = '0.05em';
    this.nameEl.style.textShadow = '0 1px 4px rgba(0,0,0,0.8)';

    this.hintEl = document.createElement('div');
    this.hintEl.style.color = '#fff';
    this.hintEl.style.fontFamily = 'sans-serif';
    this.hintEl.style.fontSize = '0.95rem';
    this.hintEl.style.opacity = '0.85';
    this.hintEl.style.marginTop = '0.4rem';
    this.hintEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';

    this.element.append(this.nameEl, this.hintEl);
    document.getElementById('ui-root')?.appendChild(this.element);
  }

  /** 場所名 + 次の一歩を表示し、ホールド後にゆっくりフェードアウトする。再呼び出しでタイマーを立て直す。 */
  show(name: string, hint: string): void {
    if (this.hideTimeoutId !== null) {
      clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }
    this.nameEl.textContent = name;
    this.hintEl.textContent = hint;
    this.element.style.transition = `opacity ${FADE_IN_SECONDS}s ease`;
    this.element.style.opacity = '1';
    this.hideTimeoutId = setTimeout(() => {
      this.element.style.transition = `opacity ${FADE_OUT_SECONDS}s ease`;
      this.element.style.opacity = '0';
      this.hideTimeoutId = null;
    }, HOLD_SECONDS * 1000);
  }
}
