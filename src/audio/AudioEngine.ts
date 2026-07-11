export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  /** リバーブへの送り（挿入点）。main.ts が Reverb.input へ接続し、環境音を dry(master) と並列で送る。 */
  readonly reverbSend: GainNode;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 1;
  }

  /**
   * ユーザー操作（クリック）のタイミングで呼び、ブラウザの自動再生制限を解除する。
   * resume() の成否を反映した Promise<boolean> を返す（true = 再生可能な状態になった）。
   * 呼び出し側が await しなくても（fire-and-forgetでも）挙動は変わらない。
   */
  async unlock(): Promise<boolean> {
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    return this.ctx.state === 'running';
  }
}
