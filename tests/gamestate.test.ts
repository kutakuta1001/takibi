import { describe, it, expect } from 'vitest';
import { GameState } from '../src/systems/GameState';

describe('GameState', () => {
  it('feeds fire only when logs exist', () => {
    const gs = new GameState();
    expect(gs.feedFire()).toBe(false);
    gs.addLogs(2);
    expect(gs.feedFire()).toBe(true);
    expect(gs.logs).toBe(1);
    expect(gs.fireFuel).toBe(25);
  });
  it('clamps fuel at FUEL_MAX and decays over time', () => {
    const gs = new GameState();
    gs.addLogs(10);
    for (let i = 0; i < 10; i++) gs.feedFire();
    expect(gs.fireFuel).toBe(100);
    gs.tick(10);
    expect(gs.fireFuel).toBeCloseTo(95);
  });
  it('runs the kettle state machine to coffee', () => {
    const gs = new GameState();
    gs.addLogs(1); gs.feedFire();
    expect(gs.putKettleOnFire()).toBe(false);   // まだ水がない
    expect(gs.fillKettle()).toBe(true);
    expect(gs.putKettleOnFire()).toBe(true);
    gs.tick(30);
    expect(gs.kettle).toBe('ready');
    expect(gs.drinkCoffee()).toBe(true);
    expect(gs.kettle).toBe('empty');
  });
  it('pauses brewing when the fire dies', () => {
    const gs = new GameState();
    gs.addLogs(1); gs.feedFire(); gs.fillKettle(); gs.putKettleOnFire();
    gs.tick(15);
    // 残り燃料を強制的に使い切る（25 - 15*0.5 = 17.5 → 35秒で0）
    gs.tick(40);
    expect(gs.kettle).toBe('onFire');            // 火が消えて進行停止、readyにならない
    expect(gs.brewProgress).toBeLessThan(1);
  });
  it('emits events', () => {
    const gs = new GameState();
    let fired = 0;
    gs.on('logs-changed', () => fired++);
    gs.addLogs(3);
    expect(fired).toBe(1);
  });
});
