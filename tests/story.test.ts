import { describe, expect, it } from 'vitest';
import { SCENARIO, SPOT_NAMES, type SpotId, type StoryContext } from '../src/story/scenario';
import { StoryEngine } from '../src/story/StoryEngine';
import type { KettleState } from '../src/systems/GameState';

function ctx(overrides: Partial<StoryContext> = {}): StoryContext {
  return {
    spot: 'campsite',
    logs: 0,
    kettle: 'empty',
    fireLit: false,
    treeFelled: false,
    ...overrides,
  };
}

const engine = new StoryEngine();
const labels = (c: StoryContext) => engine.view(c).choices.map((ch) => ch.label);

describe('scenario: campsite', () => {
  it('初期状態では 木を切る / 川辺へ / 雪山へ の3択になる', () => {
    expect(labels(ctx())).toEqual(['木を切る', '川辺へ向かう', '雪山へ向かう']);
  });

  it('伐倒後は 木を切る が消える', () => {
    expect(labels(ctx({ treeFelled: true }))).not.toContain('木を切る');
  });

  it('薪があるときだけ 薪をくべる が出る', () => {
    expect(labels(ctx({ logs: 3, treeFelled: true }))).toContain('焚き火に薪をくべる');
    expect(labels(ctx({ logs: 0, treeFelled: true }))).not.toContain('焚き火に薪をくべる');
  });

  it('水入りケトル + 火が点いているときだけ ケトルを火にかける が出る', () => {
    expect(labels(ctx({ kettle: 'filled', fireLit: true, treeFelled: true }))).toContain(
      'ケトルを火にかける'
    );
    expect(labels(ctx({ kettle: 'filled', fireLit: false, treeFelled: true }))).not.toContain(
      'ケトルを火にかける'
    );
  });

  it('コーヒーができたら 座って一杯 が出る', () => {
    expect(labels(ctx({ kettle: 'ready', fireLit: true, treeFelled: true }))).toContain(
      '火のそばに座って一杯を飲む'
    );
  });
});

describe('scenario: riverside', () => {
  it('ケトルが空のときだけ 水を汲む が出る', () => {
    expect(labels(ctx({ spot: 'riverside' }))).toContain('川の水を汲む');
    expect(labels(ctx({ spot: 'riverside', kettle: 'filled' }))).not.toContain('川の水を汲む');
  });
});

describe('scenario: snowfield', () => {
  it('コーヒーの有無で 山頂の一杯 / 眺める が切り替わる（同時には出ない）', () => {
    const withCoffee = labels(ctx({ spot: 'snowfield', kettle: 'ready' }));
    const without = labels(ctx({ spot: 'snowfield' }));
    expect(withCoffee).toContain('山頂で一杯を飲む');
    expect(withCoffee).not.toContain('腰を下ろして稜線を眺める');
    expect(without).toContain('腰を下ろして稜線を眺める');
    expect(without).not.toContain('山頂で一杯を飲む');
  });
});

describe('scenario: 全状態の網羅検証', () => {
  // プレイ上到達可能な状態のみ列挙する。薪(logs)と火(fireLit)は伐倒後にしか生まれず、
  // onFire/ready のケトルは火を経由しないと作れない（水汲みだけは伐倒前でも可能）。
  function reachable(c: StoryContext): boolean {
    if (c.treeFelled) return true;
    return c.logs === 0 && !c.fireLit && (c.kettle === 'empty' || c.kettle === 'filled');
  }

  const spots: SpotId[] = ['campsite', 'riverside', 'snowfield'];
  const kettles: KettleState[] = ['empty', 'filled', 'onFire', 'ready'];
  const allContexts: StoryContext[] = [];
  for (const spot of spots)
    for (const kettle of kettles)
      for (const logs of [0, 3])
        for (const fireLit of [false, true])
          for (const treeFelled of [false, true]) {
            const c: StoryContext = { spot, kettle, logs, fireLit, treeFelled };
            if (reachable(c)) allContexts.push(c);
          }

  it('どの状態でも本文は非空・選択肢は1〜4個・ラベルは重複しない', () => {
    for (const c of allContexts) {
      const view = engine.view(c);
      expect(view.text.length, JSON.stringify(c)).toBeGreaterThan(0);
      expect(view.choices.length, JSON.stringify(c)).toBeGreaterThanOrEqual(1);
      expect(view.choices.length, JSON.stringify(c)).toBeLessThanOrEqual(4);
      const ls = view.choices.map((ch) => ch.label);
      expect(new Set(ls).size, JSON.stringify(c)).toBe(ls.length);
    }
  });

  it('移動の選択肢はハブ&スポーク（campsite⇔riverside / campsite⇔snowfield）に従う', () => {
    const allowed: Record<SpotId, SpotId[]> = {
      campsite: ['riverside', 'snowfield'],
      riverside: ['campsite'],
      snowfield: ['campsite'],
    };
    for (const c of allContexts) {
      for (const choice of engine.view(c).choices) {
        if (choice.effect.kind === 'travel') {
          expect(allowed[c.spot], JSON.stringify(c)).toContain(choice.effect.to);
        }
      }
    }
  });

  it('SPOT_NAMES は3スポットぶん定義されている', () => {
    expect(Object.keys(SPOT_NAMES).sort()).toEqual(['campsite', 'riverside', 'snowfield']);
  });
});
