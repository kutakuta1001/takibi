import { describe, it, expect, vi } from 'vitest';
import { SpotManager, type Spot } from '../src/pano/SpotManager';

function makeSpots(): Spot[] {
  return [
    { id: 'campsite', panoUrl: '/panos/campsite.jpg', audioMix: { wind: 0.3, river: 0.08, birds: true, insects: false } },
    { id: 'riverside', panoUrl: '/panos/riverside.jpg', audioMix: { wind: 0.15, river: 0.55, birds: false, insects: false } },
  ];
}

describe('SpotManager', () => {
  it('starts idle at the first spot', () => {
    const sm = new SpotManager(makeSpots(), vi.fn());
    expect(sm.current).toBe('campsite');
    expect(sm.busy).toBe(false);
    expect(sm.fadeOpacity).toBe(0);
  });

  it('transitions through fadingOut -> fadingIn -> idle and applies the target exactly once', async () => {
    const onApply = vi.fn();
    const sm = new SpotManager(makeSpots(), onApply);

    const done = sm.transitionTo('riverside');
    expect(sm.busy).toBe(true);
    expect(sm.current).toBe('campsite'); // フェードアウト中はまだ切り替わっていない
    expect(onApply).not.toHaveBeenCalled();

    sm.update(0.75); // フェードアウト完了 → ここで切り替え
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'riverside' }));
    expect(sm.current).toBe('riverside');
    expect(sm.busy).toBe(true); // フェードイン中はまだ busy

    sm.update(0.75); // フェードイン完了
    await done;
    expect(sm.busy).toBe(false);
    expect(sm.current).toBe('riverside');
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('ignores transitionTo calls while busy', () => {
    const onApply = vi.fn();
    const sm = new SpotManager(makeSpots(), onApply);

    void sm.transitionTo('riverside');
    void sm.transitionTo('riverside'); // busy 中なので無視される

    sm.update(0.75);
    sm.update(0.75);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(sm.busy).toBe(false);
  });

  it('ignores transitionTo to the already-current spot', () => {
    const onApply = vi.fn();
    const sm = new SpotManager(makeSpots(), onApply);

    void sm.transitionTo('campsite');

    expect(sm.busy).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('exposes fadeOpacity peaking at 1 at the crossover point', () => {
    const sm = new SpotManager(makeSpots(), vi.fn());

    void sm.transitionTo('riverside');
    expect(sm.fadeOpacity).toBe(0);

    sm.update(0.375); // フェードアウト半分
    expect(sm.fadeOpacity).toBeCloseTo(0.5);

    sm.update(0.375); // フェードアウト完了 → フェードイン開始
    expect(sm.fadeOpacity).toBeCloseTo(1);

    sm.update(0.75); // フェードイン完了
    expect(sm.fadeOpacity).toBe(0);
  });
});
