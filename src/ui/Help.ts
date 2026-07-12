const FLOW_INTRO_TEXT =
  '木を切り、火を育て、水を汲んで一杯のコーヒーを淹れる。出来たての一杯は山頂まで持って行ける。';

/**
 * H キーまたは右下「?」ボタンで開閉する半透明オーバーレイ（Credits.ts と同じ構成）。
 * 操作方法・現在スポットのできること（動的）・体験の流れの短い紹介文を示す。
 * 開いている間は視点操作・選択肢での操作を止める（main.ts が isOpen を見て毎フレーム合成する。
 * SitSequence と同じ enabled フラグを直接ここでは書き換えない — 座り中との競合を避けるため）。
 */
export class Help {
  private readonly overlay: HTMLDivElement;
  private readonly actionsList: HTMLDivElement;
  private readonly areaNameEl: HTMLDivElement;
  private visible = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' || event.key === '?') this.hide();
  };

  constructor(
    private readonly getAreaName: () => string,
    private readonly getSpotActions: () => string[]
  ) {
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    this.overlay.style.inset = '0';
    this.overlay.style.display = 'flex';
    this.overlay.style.alignItems = 'center';
    this.overlay.style.justifyContent = 'center';
    this.overlay.style.background = 'rgba(0, 0, 0, 0.72)';
    this.overlay.style.fontFamily = 'sans-serif';
    this.overlay.style.color = '#fff';
    this.overlay.style.pointerEvents = 'auto';
    this.overlay.style.zIndex = '20';

    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.hide();
    });

    const panel = document.createElement('div');
    panel.style.background = 'rgba(20, 20, 20, 0.92)';
    panel.style.border = '1px solid rgba(255, 255, 255, 0.25)';
    panel.style.borderRadius = '12px';
    panel.style.padding = '2rem 2.4rem';
    panel.style.maxWidth = '32rem';
    panel.style.maxHeight = '80vh';
    panel.style.overflowY = 'auto';
    panel.style.lineHeight = '1.7';

    const heading = document.createElement('div');
    heading.textContent = 'ヘルプ';
    heading.style.fontSize = '1.3rem';
    heading.style.letterSpacing = '0.05em';
    heading.style.marginBottom = '1.4rem';
    panel.appendChild(heading);

    const controlsHeading = document.createElement('div');
    controlsHeading.textContent = '操作方法';
    controlsHeading.style.fontSize = '0.9rem';
    controlsHeading.style.opacity = '0.65';
    controlsHeading.style.marginBottom = '0.4rem';
    panel.appendChild(controlsHeading);

    const controlsBody = document.createElement('div');
    controlsBody.style.marginBottom = '1.4rem';
    controlsBody.style.fontSize = '0.95rem';
    controlsBody.append(
      this.buildLine('マウスドラッグ: 見回す'),
      this.buildLine('画面下の選択肢: 過ごし方を選ぶ'),
      this.buildLine('H または右下の「?」: このヘルプ')
    );
    panel.appendChild(controlsBody);

    this.areaNameEl = document.createElement('div');
    this.areaNameEl.style.fontSize = '0.9rem';
    this.areaNameEl.style.opacity = '0.65';
    this.areaNameEl.style.marginBottom = '0.4rem';
    panel.appendChild(this.areaNameEl);

    this.actionsList = document.createElement('div');
    this.actionsList.style.marginBottom = '1.4rem';
    this.actionsList.style.fontSize = '0.95rem';
    panel.appendChild(this.actionsList);

    const introHeading = document.createElement('div');
    introHeading.textContent = 'この体験について';
    introHeading.style.fontSize = '0.9rem';
    introHeading.style.opacity = '0.65';
    introHeading.style.marginBottom = '0.4rem';
    panel.appendChild(introHeading);

    const introBody = document.createElement('div');
    introBody.textContent = FLOW_INTRO_TEXT;
    introBody.style.fontSize = '0.95rem';
    introBody.style.marginBottom = '1.4rem';
    panel.appendChild(introBody);

    const closeButton = document.createElement('button');
    closeButton.className = 'tk-button';
    closeButton.type = 'button';
    closeButton.textContent = '閉じる';
    closeButton.style.padding = '0.5rem 1.2rem';
    closeButton.style.fontSize = '0.95rem';
    closeButton.style.color = '#fff';
    closeButton.style.background = 'rgba(255, 255, 255, 0.12)';
    closeButton.style.border = '1px solid rgba(255, 255, 255, 0.5)';
    closeButton.style.borderRadius = '999px';
    closeButton.style.cursor = 'pointer';
    closeButton.addEventListener('click', () => this.hide());
    panel.appendChild(closeButton);

    this.overlay.appendChild(panel);
  }

  private buildLine(text: string): HTMLDivElement {
    const line = document.createElement('div');
    line.textContent = text;
    line.style.marginBottom = '0.3rem';
    return line;
  }

  get isOpen(): boolean {
    return this.visible;
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;

    // この場所でできること（動的）: 開いた瞬間の実際の prompt(gs) を列挙する。
    this.areaNameEl.textContent = `${this.getAreaName()} でできること`;
    this.actionsList.replaceChildren();
    const actions = this.getSpotActions();
    if (actions.length === 0) {
      this.actionsList.appendChild(this.buildLine('ここでは特にすることはない。景色を眺めよう'));
    } else {
      for (const action of actions) {
        this.actionsList.appendChild(this.buildLine(action));
      }
    }

    document.getElementById('ui-root')?.appendChild(this.overlay);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.overlay.remove();
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }
}
