import * as THREE from 'three';

const UPDATE_INTERVAL_SECONDS = 1;

/**
 * location.search に debug=1 がある場合だけ表示する軽量な fps / レンダリング統計オーバーレイ。
 * 本番ビルドでも `?debug=1` を付けてアクセスすれば使える（コード自体は常に入っているが、
 * 通常時はDOM要素を作らないため見た目・挙動への影響はない）。
 */
export class DebugOverlay {
  private readonly element: HTMLDivElement | null = null;
  private frameTimesMs: number[] = [];
  private elapsedSinceUpdate = 0;

  static isEnabled(search: string = location.search): boolean {
    return new URLSearchParams(search).get('debug') === '1';
  }

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly getCurrentSpotLabel: () => string
  ) {
    if (!DebugOverlay.isEnabled()) return;

    this.element = document.createElement('div');
    this.element.style.position = 'fixed';
    this.element.style.left = '0.6rem';
    this.element.style.top = '0.6rem';
    this.element.style.color = '#9f9';
    this.element.style.fontFamily = 'monospace';
    this.element.style.fontSize = '0.75rem';
    this.element.style.lineHeight = '1.4';
    this.element.style.whiteSpace = 'pre';
    this.element.style.background = 'rgba(0, 0, 0, 0.5)';
    this.element.style.padding = '0.4rem 0.6rem';
    this.element.style.pointerEvents = 'none';
    document.getElementById('ui-root')?.appendChild(this.element);
  }

  /** dt: 秒。engine.onUpdate から毎フレーム呼ぶ。1秒分たまるごとに集計してDOM表示を更新する。 */
  recordFrame(dt: number): void {
    if (!this.element) return;

    this.frameTimesMs.push(dt * 1000);
    this.elapsedSinceUpdate += dt;
    if (this.elapsedSinceUpdate < UPDATE_INTERVAL_SECONDS) return;

    this.render();
    this.frameTimesMs = [];
    this.elapsedSinceUpdate = 0;
  }

  private render(): void {
    if (!this.element || this.frameTimesMs.length === 0) return;

    const sorted = [...this.frameTimesMs].sort((a, b) => a - b);
    const avgMs = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const worstMs = sorted[sorted.length - 1];
    const info = this.renderer.info;

    this.element.textContent = [
      `avg fps: ${(1000 / avgMs).toFixed(1)}`,
      `p95 frame: ${p95Ms.toFixed(1)}ms`,
      `worst frame: ${worstMs.toFixed(1)}ms`,
      `draw calls: ${info.render.calls}`,
      `geo+tex: ${info.memory.geometries + info.memory.textures}`,
      `spot: ${this.getCurrentSpotLabel()}`,
    ].join('\n');
  }
}
