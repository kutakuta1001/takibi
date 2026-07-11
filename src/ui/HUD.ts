import type { KettleState } from '../systems/GameState';

const DEFAULT_FLASH_SECONDS = 3;
const IDLE_FADE_OUT_SECONDS = 1.5; // idle化: ゆっくりフェードアウト
const IDLE_FADE_IN_SECONDS = 0.3; // 復帰: すぐフェードイン
const HELP_BUTTON_OPACITY = 0.7; // 他のナビボタン（音量・スポット遷移）と同じ通常時の視認性
const HELP_BUTTON_HOVER_OPACITY = 1.0;

const KETTLE_LABELS: Record<KettleState, string> = {
  empty: 'なし',
  filled: '水入り',
  onFire: '沸かし中',
  ready: 'できた',
};

/** 画面中央下の文脈プロンプト・左下の所持品トレイ・一時的な誘導/通知文言を表示するオーバーレイ HUD。 */
export class HUD {
  private readonly promptEl: HTMLDivElement;
  private readonly inventoryEl: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private readonly helpButtonEl: HTMLButtonElement;
  private flashTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.promptEl = document.createElement('div');
    this.promptEl.style.position = 'fixed';
    this.promptEl.style.left = '50%';
    this.promptEl.style.bottom = '10%';
    this.promptEl.style.transform = 'translateX(-50%)';
    this.promptEl.style.color = '#fff';
    this.promptEl.style.fontFamily = 'sans-serif';
    this.promptEl.style.fontSize = '1.1rem';
    this.promptEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
    this.promptEl.style.pointerEvents = 'none';

    this.inventoryEl = document.createElement('div');
    this.inventoryEl.style.position = 'fixed';
    this.inventoryEl.style.left = '3%';
    this.inventoryEl.style.bottom = '4%';
    this.inventoryEl.style.color = '#fff';
    this.inventoryEl.style.fontFamily = 'sans-serif';
    this.inventoryEl.style.fontSize = '0.95rem';
    this.inventoryEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
    this.inventoryEl.style.pointerEvents = 'none';
    this.inventoryEl.style.opacity = '1';
    this.inventoryEl.style.transition = `opacity ${IDLE_FADE_IN_SECONDS}s ease`;

    this.flashEl = document.createElement('div');
    this.flashEl.style.position = 'fixed';
    this.flashEl.style.left = '50%';
    this.flashEl.style.top = '20%';
    this.flashEl.style.transform = 'translateX(-50%)';
    this.flashEl.style.color = '#fff';
    this.flashEl.style.fontFamily = 'sans-serif';
    this.flashEl.style.fontSize = '1.2rem';
    this.flashEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
    this.flashEl.style.pointerEvents = 'none';
    this.flashEl.style.opacity = '0';
    this.flashEl.style.transition = 'opacity 0.3s ease';

    this.helpButtonEl = document.createElement('button');
    this.helpButtonEl.type = 'button';
    this.helpButtonEl.className = 'tk-button';
    this.helpButtonEl.textContent = '?';
    this.helpButtonEl.setAttribute('aria-label', 'ヘルプ');
    this.helpButtonEl.style.position = 'fixed';
    this.helpButtonEl.style.right = '4%';
    this.helpButtonEl.style.bottom = '23%'; // ナビボタン最大2個の積み上げ(10%起点)・音量(3%)の上に重ならない高さ
    this.helpButtonEl.style.width = '2.4rem';
    this.helpButtonEl.style.height = '2.4rem';
    this.helpButtonEl.style.fontSize = '1rem';
    this.helpButtonEl.style.fontFamily = 'sans-serif';
    this.helpButtonEl.style.color = '#fff';
    this.helpButtonEl.style.background = 'rgba(0, 0, 0, 0.35)';
    this.helpButtonEl.style.border = '1px solid rgba(255, 255, 255, 0.6)';
    this.helpButtonEl.style.borderRadius = '999px';
    this.helpButtonEl.style.cursor = 'pointer';
    this.helpButtonEl.style.pointerEvents = 'auto';
    this.helpButtonEl.style.opacity = String(HELP_BUTTON_OPACITY);
    this.helpButtonEl.style.transition = `opacity ${IDLE_FADE_IN_SECONDS}s ease`;
    this.helpButtonEl.addEventListener('mouseenter', () => {
      this.helpButtonEl.style.opacity = String(HELP_BUTTON_HOVER_OPACITY);
    });
    this.helpButtonEl.addEventListener('mouseleave', () => {
      this.helpButtonEl.style.opacity = String(HELP_BUTTON_OPACITY);
    });

    document.getElementById('ui-root')?.append(this.promptEl, this.inventoryEl, this.flashEl, this.helpButtonEl);

    this.setInventory(0, 'empty');
  }

  /** main.ts が Help.toggle を配線する（HUD自身はHelpの実体を知らない）。 */
  onHelpClick(cb: () => void): void {
    this.helpButtonEl.addEventListener('click', cb);
  }

  setPrompt(text: string | null): void {
    this.promptEl.textContent = text ?? '';
  }

  setInventory(logs: number, kettle: KettleState): void {
    this.inventoryEl.textContent = `薪: ${logs}　ケトル: ${KETTLE_LABELS[kettle]}`;
  }

  /**
   * 無操作時に所持品トレイを消灯する（DOMは残す）。中央の文脈プロンプト（promptEl）は
   * 体験の道標のため対象外（idle中に何も見ていなければ元々表示されない）。
   */
  setIdle(idle: boolean): void {
    this.inventoryEl.style.transition = `opacity ${idle ? IDLE_FADE_OUT_SECONDS : IDLE_FADE_IN_SECONDS}s ease`;
    this.inventoryEl.style.opacity = idle ? '0' : '1';
    this.helpButtonEl.style.transition = `opacity ${idle ? IDLE_FADE_OUT_SECONDS : IDLE_FADE_IN_SECONDS}s ease`;
    this.helpButtonEl.style.opacity = idle ? '0' : String(HELP_BUTTON_OPACITY);
  }

  flashMessage(text: string, seconds: number = DEFAULT_FLASH_SECONDS): void {
    if (this.flashTimeoutId !== null) {
      clearTimeout(this.flashTimeoutId);
    }
    this.flashEl.textContent = text;
    this.flashEl.style.opacity = '1';
    this.flashTimeoutId = setTimeout(() => {
      this.flashEl.style.opacity = '0';
      this.flashTimeoutId = null;
    }, seconds * 1000);
  }
}
