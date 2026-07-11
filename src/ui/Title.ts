export type TitleLoadState = 'loading' | 'ready' | 'failed';

const HEADING_TEXT = 'Takibi';
const LOADING_MESSAGE = '森を準備しています…';
const FAILED_MESSAGE = '読み込みに失敗しました';
const START_LABEL = 'はじめる';
const RETRY_LABEL = '再試行';
const HINT_TEXT = 'マウスドラッグで見回す';

/**
 * タイトル画面。campsite パノラマの読み込み状態を3状態で表す:
 * loading（読み込み中・開始不可）/ ready（開始ボタン活性）/ failed（再試行ボタンで load をやり直す）。
 * 開始・再試行・クレジットは本物の <button> にし、Enter/Space での発火・フォーカスリング・
 * Tab順序（開始 → クレジット）を確保する（クリックのみに頼らないキーボード到達性のため）。
 */
export class Title {
  private readonly element: HTMLDivElement;
  private readonly heading: HTMLDivElement;
  private readonly stateArea: HTMLDivElement;
  private readonly creditsButton: HTMLButtonElement | null = null;
  private state: TitleLoadState = 'loading';

  constructor(
    private readonly load: () => Promise<void>,
    private readonly onStart: () => void,
    private readonly onUnlock?: () => void,
    private readonly onCredits?: () => void
  ) {
    this.element = document.createElement('div');
    this.element.style.position = 'fixed';
    this.element.style.inset = '0';
    this.element.style.display = 'flex';
    this.element.style.flexDirection = 'column';
    this.element.style.alignItems = 'center';
    this.element.style.justifyContent = 'center';
    this.element.style.gap = '1.2rem';
    this.element.style.textAlign = 'center';
    this.element.style.background = '#000';
    this.element.style.color = '#fff';
    this.element.style.fontFamily = 'sans-serif';
    this.element.style.pointerEvents = 'auto';

    this.heading = document.createElement('div');
    this.heading.textContent = HEADING_TEXT;
    this.heading.style.fontSize = '2.2rem';
    this.heading.style.letterSpacing = '0.1em';

    this.stateArea = document.createElement('div');
    this.stateArea.style.display = 'flex';
    this.stateArea.style.flexDirection = 'column';
    this.stateArea.style.alignItems = 'center';
    this.stateArea.style.gap = '1.2rem';

    this.element.append(this.heading, this.stateArea);

    if (onCredits) {
      this.creditsButton = this.buildButton('写真クレジット');
      this.creditsButton.style.position = 'fixed';
      this.creditsButton.style.right = '4%';
      this.creditsButton.style.bottom = '4%';
      this.creditsButton.style.padding = '0.4rem 1rem';
      this.creditsButton.style.fontSize = '0.85rem';
      this.creditsButton.style.background = 'rgba(255, 255, 255, 0.08)';
      this.creditsButton.style.border = '1px solid rgba(255, 255, 255, 0.4)';
      this.creditsButton.addEventListener('click', () => onCredits());
      this.element.appendChild(this.creditsButton);
    }

    this.attemptLoad();
  }

  private buildButton(label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = label;
    button.className = 'tk-button';
    button.type = 'button';
    button.style.padding = '0.6rem 1.6rem';
    button.style.fontSize = '1.1rem';
    button.style.fontFamily = 'sans-serif';
    button.style.color = '#fff';
    button.style.background = 'rgba(255, 255, 255, 0.1)';
    button.style.border = '1px solid rgba(255, 255, 255, 0.6)';
    button.style.borderRadius = '999px';
    return button;
  }

  /** campsite の読み込みを開始する（冪等な load() を呼ぶだけなので、再試行時に呼び直しても安全）。 */
  private attemptLoad(): void {
    this.setState('loading');
    this.load().then(
      () => this.setState('ready'),
      () => this.setState('failed')
    );
  }

  private setState(state: TitleLoadState): void {
    this.state = state;
    this.stateArea.replaceChildren();

    if (state === 'loading') {
      const message = document.createElement('div');
      message.textContent = LOADING_MESSAGE;
      message.style.fontSize = '1.1rem';
      message.style.opacity = '0.85';
      this.stateArea.appendChild(message);
      return;
    }

    if (state === 'failed') {
      const message = document.createElement('div');
      message.textContent = FAILED_MESSAGE;
      message.style.fontSize = '1.1rem';

      const retryButton = this.buildButton(RETRY_LABEL);
      retryButton.addEventListener('click', () => this.attemptLoad());

      this.stateArea.append(message, retryButton);
      return;
    }

    // ready
    const startButton = this.buildButton(START_LABEL);
    startButton.addEventListener('click', () => {
      this.onUnlock?.();
      this.hide();
      this.onStart();
    });

    const hint = document.createElement('div');
    hint.textContent = HINT_TEXT;
    hint.style.fontSize = '0.9rem';
    hint.style.opacity = '0.75';

    this.stateArea.append(startButton, hint);
  }

  get currentState(): TitleLoadState {
    return this.state;
  }

  show(): void {
    document.getElementById('ui-root')?.appendChild(this.element);
  }

  hide(): void {
    this.element.remove();
  }
}
