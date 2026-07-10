import { describe, it, expect, vi } from 'vitest';
import { IdleWatcher } from '../src/ui/IdleWatcher';

describe('IdleWatcher', () => {
  it('starts as not idle', () => {
    const watcher = new IdleWatcher(8);
    expect(watcher.idle).toBe(false);
  });

  it('becomes idle once idleSeconds have elapsed without activity', () => {
    const watcher = new IdleWatcher(8);
    watcher.update(7.9);
    expect(watcher.idle).toBe(false);
    watcher.update(0.2);
    expect(watcher.idle).toBe(true);
  });

  it('activity() resets the timer and clears idle', () => {
    const watcher = new IdleWatcher(8);
    watcher.update(8.5);
    expect(watcher.idle).toBe(true);

    watcher.activity();
    expect(watcher.idle).toBe(false);

    watcher.update(7.9);
    expect(watcher.idle).toBe(false);
  });

  it('notifies onChange listeners exactly once per transition', () => {
    const watcher = new IdleWatcher(8);
    const cb = vi.fn();
    watcher.onChange(cb);

    watcher.update(8.5);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(true);

    watcher.update(1); // まだidleのまま。追加発火しない
    expect(cb).toHaveBeenCalledTimes(1);

    watcher.activity();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(false);

    watcher.activity(); // すでにactiveなので発火しない
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('supports multiple listeners', () => {
    const watcher = new IdleWatcher(8);
    const a = vi.fn();
    const b = vi.fn();
    watcher.onChange(a);
    watcher.onChange(b);

    watcher.update(8.1);
    expect(a).toHaveBeenCalledWith(true);
    expect(b).toHaveBeenCalledWith(true);
  });

  it('does not become idle while repeated activity() keeps resetting the timer', () => {
    const watcher = new IdleWatcher(8);
    for (let i = 0; i < 20; i++) {
      watcher.update(5);
      watcher.activity();
    }
    expect(watcher.idle).toBe(false);
  });
});
