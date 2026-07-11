const STORAGE_KEY = 'takibi-volume';
const DEFAULT_VOLUME = 100;
const IDLE_FADE_OUT_SECONDS = 1.5; // idle化: ゆっくりフェードアウト（他のナビUIと合わせる）
const IDLE_FADE_IN_SECONDS = 0.3; // 復帰: すぐフェードイン

/**
 * 画面右下の控えめな音量コントロール。「音量」ボタンをクリックすると横スライダー（0〜100）が
 * 内側へ展開し、AudioEngine.master.gain を直接制御する。値は localStorage に保存し、
 * 次回起動時に復元する（初回は無音量指定=フル）。IdleWatcher と連動して無操作時は
 * 他のナビUIと一緒に消灯する（setIdle を main.ts から呼ぶ）。
 */
export class VolumeControl {
  private readonly container: HTMLDivElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly sliderWrap: HTMLDivElement;
  private readonly slider: HTMLInputElement;
  private expanded = false;

  constructor(private readonly masterGain: GainNode) {
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.right = '4%';
    this.container.style.bottom = '3%';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.gap = '0.5rem';
    this.container.style.opacity = '1';
    this.container.style.transition = `opacity ${IDLE_FADE_IN_SECONDS}s ease`;

    this.sliderWrap = document.createElement('div');
    this.sliderWrap.style.display = 'none';
    this.sliderWrap.style.alignItems = 'center';
    this.sliderWrap.style.padding = '0.3rem 0.8rem';
    this.sliderWrap.style.background = 'rgba(0, 0, 0, 0.35)';
    this.sliderWrap.style.border = '1px solid rgba(255, 255, 255, 0.6)';
    this.sliderWrap.style.borderRadius = '999px';
    this.sliderWrap.style.pointerEvents = 'auto';

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '100';
    this.slider.style.width = '120px';
    this.slider.style.accentColor = 'rgba(255, 255, 255, 0.85)'; // ブラウザ標準の青を避け既存UIの白基調に揃える
    this.slider.setAttribute('aria-label', '音量');
    this.sliderWrap.appendChild(this.slider);

    this.toggleButton = document.createElement('button');
    this.toggleButton.type = 'button';
    this.toggleButton.className = 'tk-button';
    this.toggleButton.textContent = '音量';
    this.toggleButton.style.padding = '0.6rem 1.1rem';
    this.toggleButton.style.fontSize = '1rem';
    this.toggleButton.style.fontFamily = 'sans-serif';
    this.toggleButton.style.color = '#fff';
    this.toggleButton.style.background = 'rgba(0, 0, 0, 0.35)';
    this.toggleButton.style.border = '1px solid rgba(255, 255, 255, 0.6)';
    this.toggleButton.style.borderRadius = '999px';
    this.toggleButton.style.pointerEvents = 'auto';
    this.toggleButton.style.opacity = '0.7';
    this.toggleButton.style.transition = 'opacity 0.2s ease';
    this.toggleButton.addEventListener('mouseenter', () => {
      this.toggleButton.style.opacity = '1';
    });
    this.toggleButton.addEventListener('mouseleave', () => {
      this.toggleButton.style.opacity = '0.7';
    });
    this.toggleButton.addEventListener('click', () => this.setExpanded(!this.expanded));

    this.container.append(this.sliderWrap, this.toggleButton);
    document.getElementById('ui-root')?.appendChild(this.container);

    const initialVolume = this.loadStoredVolume();
    this.slider.value = String(initialVolume);
    this.applyVolume(initialVolume);
    this.slider.addEventListener('input', () => {
      const value = Number(this.slider.value);
      this.applyVolume(value);
      localStorage.setItem(STORAGE_KEY, String(value));
    });
  }

  /** 無操作時に他のナビUIと一緒に消灯する（DOMは残す。展開中のスライダーは閉じる）。 */
  setIdle(idle: boolean): void {
    if (idle) {
      this.setExpanded(false);
    }
    this.container.style.transition = `opacity ${idle ? IDLE_FADE_OUT_SECONDS : IDLE_FADE_IN_SECONDS}s ease`;
    this.container.style.opacity = idle ? '0' : '1';
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.sliderWrap.style.display = expanded ? 'flex' : 'none';
  }

  private loadStoredVolume(): number {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_VOLUME;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
    return Math.min(100, Math.max(0, parsed));
  }

  private applyVolume(value: number): void {
    this.masterGain.gain.value = value / 100;
  }
}
