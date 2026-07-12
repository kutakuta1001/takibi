const TEXT_FADE_SECONDS = 0.5;

/**
 * 画面下部中央のサウンドノベルパネル（本文 + 選択肢ボタン）。体験の入り口のため
 * IdleWatcher の消灯対象外。選択肢は実 button 要素（Tab 到達性）。
 * 演出中は setChoicesVisible(false) で選択肢だけ隠し、座り・スポット遷移・ヘルプ中は
 * setHidden(true) でパネルごと隠す（main.ts が毎フレーム合成する）。
 */
export class StoryPanel {
  private readonly container: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private readonly choicesEl: HTMLDivElement;
  private hidden = true; // タイトル画面の間は隠しておく（engine.start 後に main.ts が解除）
  private visibilityTimerId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.left = '50%';
    this.container.style.bottom = '6%';
    this.container.style.transform = 'translateX(-50%)';
    this.container.style.width = 'min(90vw, 40rem)';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.gap = '0.7rem';
    this.container.style.padding = '1rem 1.4rem';
    this.container.style.background = 'rgba(0, 0, 0, 0.35)';
    this.container.style.border = '1px solid rgba(255, 255, 255, 0.18)';
    this.container.style.borderRadius = '12px';
    this.container.style.fontFamily = 'sans-serif';
    this.container.style.color = '#fff';
    this.container.style.pointerEvents = 'auto';
    this.container.style.opacity = '0';
    this.container.style.visibility = 'hidden';
    this.container.style.transition = `opacity ${TEXT_FADE_SECONDS}s ease`;

    this.textEl = document.createElement('div');
    this.textEl.style.fontSize = '1.05rem';
    this.textEl.style.lineHeight = '1.8';
    this.textEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';

    this.choicesEl = document.createElement('div');
    this.choicesEl.style.display = 'flex';
    this.choicesEl.style.flexDirection = 'column';
    this.choicesEl.style.alignItems = 'flex-start';
    this.choicesEl.style.gap = '0.35rem';

    this.container.append(this.textEl, this.choicesEl);
    document.getElementById('ui-root')?.appendChild(this.container);
  }

  /** 本文と選択肢を差し替える。選択肢は縦並びの実 button（クリック/タップ/Tab で選ぶ）。 */
  show(text: string, choiceLabels: string[], onChoose: (index: number) => void): void {
    this.textEl.textContent = text;
    this.choicesEl.replaceChildren();
    choiceLabels.forEach((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tk-button';
      button.textContent = `▶ ${label}`;
      button.style.padding = '0.35rem 0.9rem';
      button.style.fontSize = '0.98rem';
      button.style.fontFamily = 'sans-serif';
      button.style.color = '#fff';
      button.style.background = 'rgba(255, 255, 255, 0.08)';
      button.style.border = '1px solid rgba(255, 255, 255, 0.35)';
      button.style.borderRadius = '999px';
      button.style.cursor = 'pointer';
      button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(255, 255, 255, 0.2)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(255, 255, 255, 0.08)';
      });
      button.addEventListener('click', () => onChoose(index));
      this.choicesEl.appendChild(button);
    });
  }

  /** 演出（カメラパン・伐採・座り）中は選択肢だけ隠す（本文は残す）。 */
  setChoicesVisible(visible: boolean): void {
    this.choicesEl.style.display = visible ? 'flex' : 'none';
  }

  /** 座り・スポット遷移・ヘルプ表示中はパネルごと静かに消す。main.ts が毎フレーム合成する。 */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    // 直前の hide タイマーが残っていると、後続の show/hide より遅れて発火し
    // フェード中の visibility を誤って上書きしてしまうため、遷移ごとに必ず破棄する
    if (this.visibilityTimerId !== null) {
      clearTimeout(this.visibilityTimerId);
      this.visibilityTimerId = null;
    }
    this.container.style.opacity = hidden ? '0' : '1';
    // visibility はフェード完了を待たず即時に切り替えない（Tab フォーカスだけ即時に塞ぐ）
    if (hidden) {
      this.container.style.pointerEvents = 'none';
      this.visibilityTimerId = window.setTimeout(() => {
        this.visibilityTimerId = null;
        if (this.hidden) this.container.style.visibility = 'hidden';
      }, TEXT_FADE_SECONDS * 1000);
    } else {
      this.container.style.visibility = 'visible';
      this.container.style.pointerEvents = 'auto';
    }
  }
}
