import { describe, it, expect, vi } from 'vitest';
import { SpotManager, type Spot } from '../src/pano/SpotManager';

function makeSpots(): Spot[] {
  return [
    {
      id: 'campsite',
      panoUrl: '/panos/campsite.jpg',
      audioMix: { wind: 0.3, river: 0.08, birds: true, insects: false },
      snowfall: false,
      destinations: ['riverside', 'snowfield'],
    },
    {
      id: 'riverside',
      panoUrl: '/panos/riverside.jpg',
      audioMix: { wind: 0.15, river: 0.55, birds: false, insects: false },
      snowfall: false,
      destinations: ['campsite'],
    },
    {
      id: 'snowfield',
      panoUrl: '/panos/snowfield.jpg',
      audioMix: { wind: 0.75, river: 0, birds: false, insects: false },
      snowfall: true,
      destinations: ['campsite'],
    },
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

    sm.update(1.1); // フェードアウト完了 → ここで切り替え
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'riverside' }));
    expect(sm.current).toBe('riverside');
    expect(sm.busy).toBe(true); // フェードイン中はまだ busy

    sm.update(1.5); // フェードイン完了
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

    sm.update(1.1);
    sm.update(1.5);

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

    sm.update(0.55); // フェードアウト半分
    expect(sm.fadeOpacity).toBeCloseTo(0.5);

    sm.update(0.55); // フェードアウト完了 → フェードイン開始
    expect(sm.fadeOpacity).toBeCloseTo(1);

    sm.update(1.5); // フェードイン完了
    expect(sm.fadeOpacity).toBe(0);
  });

  it('supports hub-and-spoke: campsite can reach both riverside and snowfield directly', async () => {
    const onApply = vi.fn();
    const sm = new SpotManager(makeSpots(), onApply);

    const done = sm.transitionTo('snowfield');
    sm.update(1.1);
    sm.update(1.5);
    await done;

    expect(sm.current).toBe('snowfield');
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'snowfield', snowfall: true }));
  });

  it('ignores transitionTo to a spot not listed in the current spot\'s destinations', async () => {
    const onApply = vi.fn();
    const sm = new SpotManager(makeSpots(), onApply);

    // riverside -> snowfield へ直接遷移する（riverside.destinations には campsite しかない）
    const toRiverside = sm.transitionTo('riverside');
    sm.update(1.1);
    sm.update(1.5);
    await toRiverside;
    expect(sm.current).toBe('riverside');

    void sm.transitionTo('snowfield'); // destinations 制約により無視されるはず

    expect(sm.busy).toBe(false);
    expect(sm.current).toBe('riverside');
    expect(onApply).toHaveBeenCalledTimes(1); // riverside への遷移の1回のみ
  });

  it('fires onApproach with the pending target before onApply, ahead of the crossover', () => {
    const onApply = vi.fn();
    const onApproach = vi.fn();
    const sm = new SpotManager(makeSpots(), onApply, onApproach);

    void sm.transitionTo('riverside');
    sm.update(0.6); // まだ閾値（1.1-0.4=0.7秒）未満
    expect(onApproach).not.toHaveBeenCalled();

    sm.update(0.2); // 合計0.8秒。閾値を超えたが、フェードアウト完了（1.1秒）前
    expect(onApproach).toHaveBeenCalledTimes(1);
    expect(onApproach).toHaveBeenCalledWith(expect.objectContaining({ id: 'riverside' }));
    expect(onApply).not.toHaveBeenCalled();

    sm.update(0.4); // 合計1.2秒でフェードアウト完了 → onApply発火
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApproach).toHaveBeenCalledTimes(1); // 二重発火しない
  });

  it('does not throw when onApproach is omitted', () => {
    const sm = new SpotManager(makeSpots(), vi.fn());
    void sm.transitionTo('riverside');
    expect(() => {
      sm.update(1.1);
      sm.update(1.5);
    }).not.toThrow();
  });
});
