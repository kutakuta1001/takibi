export type KettleState = 'empty' | 'filled' | 'onFire' | 'ready';
export type GameEvent = 'logs-changed' | 'fire-changed' | 'kettle-changed' | 'coffee-drunk';

export class GameState {
  static readonly FUEL_PER_LOG = 25;
  static readonly FUEL_MAX = 100;
  static readonly FUEL_DECAY = 0.5; // per second
  static readonly BREW_SECONDS = 30;

  private _logs = 0;
  private _fireFuel = 0;
  private _kettle: KettleState = 'empty';
  private _brewAccum = 0;

  private readonly listeners = new Map<GameEvent, Array<() => void>>();

  get logs(): number {
    return this._logs;
  }

  get fireFuel(): number {
    return this._fireFuel;
  }

  get fireIntensity(): number {
    return this._fireFuel / GameState.FUEL_MAX;
  }

  get kettle(): KettleState {
    return this._kettle;
  }

  get brewProgress(): number {
    return Math.min(this._brewAccum / GameState.BREW_SECONDS, 1);
  }

  on(event: GameEvent, cb: () => void): void {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(cb);
    this.listeners.set(event, callbacks);
  }

  addLogs(n: number): void {
    this._logs += n;
    this.emit('logs-changed');
  }

  feedFire(): boolean {
    if (this._logs <= 0) return false;
    this._logs -= 1;
    this._fireFuel = Math.min(this._fireFuel + GameState.FUEL_PER_LOG, GameState.FUEL_MAX);
    this.emit('logs-changed');
    this.emit('fire-changed');
    return true;
  }

  fillKettle(): boolean {
    if (this._kettle !== 'empty') return false;
    this._kettle = 'filled';
    this.emit('kettle-changed');
    return true;
  }

  putKettleOnFire(): boolean {
    if (this._kettle !== 'filled' || this._fireFuel <= 0) return false;
    this._kettle = 'onFire';
    this._brewAccum = 0;
    this.emit('kettle-changed');
    return true;
  }

  drinkCoffee(): boolean {
    if (this._kettle !== 'ready') return false;
    this._kettle = 'empty';
    this._brewAccum = 0;
    this.emit('kettle-changed');
    this.emit('coffee-drunk');
    return true;
  }

  tick(dt: number): void {
    const previousFuel = this._fireFuel;
    this._fireFuel = Math.max(0, this._fireFuel - GameState.FUEL_DECAY * dt);
    if (this._fireFuel !== previousFuel) {
      this.emit('fire-changed');
    }

    if (this._kettle === 'onFire' && this._fireFuel > 0) {
      this._brewAccum = Math.min(this._brewAccum + dt, GameState.BREW_SECONDS);
      if (this._brewAccum >= GameState.BREW_SECONDS) {
        this._kettle = 'ready';
        this.emit('kettle-changed');
      }
    }
  }

  private emit(event: GameEvent): void {
    for (const cb of this.listeners.get(event) ?? []) {
      cb();
    }
  }
}
