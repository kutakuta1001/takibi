import type { KettleState } from '../systems/GameState';

const DEFAULT_FLASH_SECONDS = 3;
const IDLE_FADE_OUT_SECONDS = 1.5; // idle化: ゆっくりフェードアウト
const IDLE_FADE_IN_SECONDS = 0.3; // 復帰: すぐフェードイン

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

    document.getElementById('ui-root')?.append(this.promptEl, this.inventoryEl, this.flashEl);

    this.setInventory(0, 'empty');
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
