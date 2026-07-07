export class Input {
  private readonly keysDown = new Set<string>();
  private readonly keyPressCallbacks = new Map<string, Array<() => void>>();
  private accumulatedDx = 0;
  private accumulatedDy = 0;

  constructor() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  onKeyPress(code: string, cb: () => void): void {
    const callbacks = this.keyPressCallbacks.get(code) ?? [];
    callbacks.push(cb);
    this.keyPressCallbacks.set(code, callbacks);
  }

  lookDelta(): { dx: number; dy: number } {
    const delta = { dx: this.accumulatedDx, dy: this.accumulatedDy };
    this.accumulatedDx = 0;
    this.accumulatedDy = 0;
    return delta;
  }

  private onKeyDown(e: KeyboardEvent): void {
    const isNewPress = !this.keysDown.has(e.code);
    this.keysDown.add(e.code);
    if (isNewPress) {
      const callbacks = this.keyPressCallbacks.get(e.code);
      if (callbacks) {
        for (const cb of callbacks) cb();
      }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.code);
  }

  private onMouseMove(e: MouseEvent): void {
    if (document.pointerLockElement === null) return;
    this.accumulatedDx += e.movementX;
    this.accumulatedDy += e.movementY;
  }
}
