export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
  }

  /** ユーザー操作（クリック）のタイミングで呼び、ブラウザの自動再生制限を解除する。 */
  unlock(): void {
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }
}
