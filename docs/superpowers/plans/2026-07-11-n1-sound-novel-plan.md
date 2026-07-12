# N1: サウンドノベル化（StoryEngine + StoryPanel + E 全廃）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現行 3 スポットの体験連鎖（伐採→焚き火→水汲み→抽出→座って飲む→山頂の一杯）を、画面下部のテキスト + 選択肢で進むサウンドノベル型に置き換え、E キーとホットスポットクリックを全廃する。

**Architecture:** 純ロジックの `story/scenario.ts`（シナリオデータ）+ `story/StoryEngine.ts`（表示決定）が「いま表示すべき本文と選択肢」を決め、`ui/StoryPanel.ts` が表示、`story/Direction.ts` が選択された行動を「カメラ自動パン + 既存演出関数」へ変換する。GameState / SpotManager / 音合成は無改修（公開面の追加のみ）。レイキャスト対話（Interaction.ts）・ホットスポット（Hotspot クラス）・ナビボタン・hints.ts は撤去する。

**Tech Stack:** Vanilla Three.js + TypeScript + Vite。テストは Vitest（`tests/` 配下、`npm run test`）。

**正典:** `docs/superpowers/specs/2026-07-11-sound-novel-pivot-design.md`（設計書 v3）

## Global Constraints

- dependencies は three / simplex-noise / alea のみ。新規追加禁止
- `audio/synths.ts` のアルゴリズム変更禁止（呼び出し方の変更・利用箇所の変更は可）
- `GameState.ts` と `story/scenario.ts` `story/StoryEngine.ts` は Three.js / DOM 非依存を厳守（単体テスト対象）
- シナリオ本文の文体: **情景だけを淡々と描く**。一人称の感想・心情（「嬉しい」「心地よい」等）は書かない
- 選択肢は同時に最大 4 つまで
- StoryPanel は IdleWatcher の消灯対象外（行動の入り口は迷いなく見える）
- ゲーミフィケーション（実績・カウンター・進捗バー）は追加しない
- 各タスク完了時に `npm run build` と `npm run test` がグリーンであること
- コミットメッセージ末尾に `Co-Authored-By:` 行（リポジトリ慣行に従う）
- N1 では時間帯は現行の夕⇔夜自動ループ（Grading）のまま変更しない

---

### Task 1: story/scenario.ts + story/StoryEngine.ts（純ロジック・TDD）

**Files:**
- Create: `src/story/scenario.ts`
- Create: `src/story/StoryEngine.ts`
- Test: `tests/story.test.ts`

**Interfaces:**
- Consumes: `KettleState`（`src/systems/GameState.ts` の既存 export）
- Produces: `SpotId` / `SPOT_NAMES` / `StoryContext` / `StoryAction` / `StoryEffect` / `MarkerId` / `StoryChoice` / `SpotScene` / `SCENARIO`（scenario.ts）、`StoryEngine`（`view(ctx: StoryContext): StoryView`）と `StoryView`（StoryEngine.ts）。Task 4 の Direction が `StoryChoice.effect` を、Task 5 の main.ts が `StoryEngine.view` / `SPOT_NAMES` / `MarkerId` を使う

- [ ] **Step 1: 失敗するテストを書く**

`tests/story.test.ts` を作成する（既存テストの命名・配置慣行に合わせる）:

```typescript
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
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test`
Expected: FAIL（`../src/story/scenario` が存在しない解決エラー）

- [ ] **Step 3: scenario.ts を実装する**

`src/story/scenario.ts` を作成する:

```typescript
import type { KettleState } from '../systems/GameState';

export type SpotId = 'campsite' | 'riverside' | 'snowfield';

/** AreaTitle・Help オーバーレイで使う場所名（旧 ui/hints.ts から移設）。 */
export const SPOT_NAMES: Record<SpotId, string> = {
  campsite: 'キャンプ地 - 深い原生林',
  riverside: '川辺 - 渓谷の滝',
  snowfield: '雪山 - 三千メートルの稜線',
};

/**
 * シナリオの本文・表示条件が参照する読み取り専用の状態スナップショット。
 * main.ts が GameState / SpotManager / Chopping から毎回組み立てる（scenario 側は純関数のまま）。
 */
export interface StoryContext {
  spot: SpotId;
  logs: number;
  kettle: KettleState;
  fireLit: boolean; // GameState.fireFuel > 0
  treeFelled: boolean; // Chopping.felled
}

export type StoryAction =
  | 'chop'
  | 'feedFire'
  | 'fillKettle'
  | 'putKettleOn'
  | 'sitDrinkFire'
  | 'sitRiverside'
  | 'sitSummit';

export type StoryEffect = { kind: 'action'; action: StoryAction } | { kind: 'travel'; to: SpotId };

/** HotspotMarker（灯り）との対応キー。main.ts が「いま出ている選択肢が指す場所」を点灯するのに使う。 */
export type MarkerId = 'tree' | 'fire' | 'kettle' | 'water' | 'riversideSeat' | 'snowfieldSeat';

export interface StoryChoice {
  label: string;
  effect: StoryEffect;
  /** 演出完了直後に本文として一度だけ表示する情景描写（次の状態変化で通常の本文に置き換わる）。 */
  narration?: string;
  marker?: MarkerId;
  /** 省略時は常に表示。 */
  when?: (ctx: StoryContext) => boolean;
}

export interface SpotScene {
  spot: SpotId;
  /** 情景だけを淡々と描く（一人称の感想・心情は書かない）。 */
  text: (ctx: StoryContext) => string;
  choices: StoryChoice[];
}

export const SCENARIO: Record<SpotId, SpotScene> = {
  campsite: {
    spot: 'campsite',
    text: (ctx) => {
      if (ctx.kettle === 'ready') return '湯気が立っている。コーヒーができた。';
      if (ctx.kettle === 'onFire') {
        return ctx.fireLit
          ? 'ケトルが火にかかっている。薪の爆ぜる音がする。'
          : '火が細くなっている。湯はまだ沸かない。';
      }
      if (ctx.fireLit) {
        return ctx.kettle === 'filled'
          ? '焚き火が燃えている。ケトルには川の水が入っている。'
          : '焚き火が燃えている。ケトルは空のままだ。';
      }
      if (ctx.logs > 0) return '切り出した薪が積んである。焚き火の跡が待っている。';
      if (ctx.treeFelled) return '森のキャンプ地。木々の間を風が抜けていく。';
      return '森のキャンプ地。焚き火の跡が残っている。薪はまだない。';
    },
    choices: [
      {
        label: '木を切る',
        effect: { kind: 'action', action: 'chop' },
        narration: '斧が四度響いた。倒れた幹から薪が取れた。',
        marker: 'tree',
        when: (ctx) => !ctx.treeFelled,
      },
      {
        label: '焚き火に薪をくべる',
        effect: { kind: 'action', action: 'feedFire' },
        narration: '薪が爆ぜて、火が大きくなった。',
        marker: 'fire',
        when: (ctx) => ctx.logs > 0,
      },
      {
        label: 'ケトルを火にかける',
        effect: { kind: 'action', action: 'putKettleOn' },
        narration: 'ケトルを火にかけた。湯が沸くのを待つ。',
        marker: 'kettle',
        when: (ctx) => ctx.kettle === 'filled' && ctx.fireLit,
      },
      {
        label: '火のそばに座って一杯を飲む',
        effect: { kind: 'action', action: 'sitDrinkFire' },
        narration: 'カップが空になった。火はまだ燃えている。',
        marker: 'kettle',
        when: (ctx) => ctx.kettle === 'ready',
      },
      { label: '川辺へ向かう', effect: { kind: 'travel', to: 'riverside' } },
      { label: '雪山へ向かう', effect: { kind: 'travel', to: 'snowfield' } },
    ],
  },
  riverside: {
    spot: 'riverside',
    text: (ctx) =>
      ctx.kettle === 'empty'
        ? '渓谷の滝が正面に見える。水は澄んでいる。'
        : '滝の音が谷に響いている。',
    choices: [
      {
        label: '川の水を汲む',
        effect: { kind: 'action', action: 'fillKettle' },
        narration: 'ケトルに冷たい水を満たした。',
        marker: 'water',
        when: (ctx) => ctx.kettle === 'empty',
      },
      {
        label: '岩に腰を下ろして滝を眺める',
        effect: { kind: 'action', action: 'sitRiverside' },
        marker: 'riversideSeat',
      },
      { label: 'キャンプ地へ戻る', effect: { kind: 'travel', to: 'campsite' } },
    ],
  },
  snowfield: {
    spot: 'snowfield',
    text: (ctx) =>
      ctx.kettle === 'ready'
        ? '三千メートルの稜線。風が雪を運んでいく。ケトルはまだ温かい。'
        : '三千メートルの稜線。風の音だけがする。',
    choices: [
      {
        label: '山頂で一杯を飲む',
        effect: { kind: 'action', action: 'sitSummit' },
        marker: 'snowfieldSeat',
        when: (ctx) => ctx.kettle === 'ready',
      },
      {
        label: '腰を下ろして稜線を眺める',
        effect: { kind: 'action', action: 'sitSummit' },
        marker: 'snowfieldSeat',
        when: (ctx) => ctx.kettle !== 'ready',
      },
      { label: 'キャンプ地へ戻る', effect: { kind: 'travel', to: 'campsite' } },
    ],
  },
};
```

- [ ] **Step 4: StoryEngine.ts を実装する**

`src/story/StoryEngine.ts` を作成する:

```typescript
import { SCENARIO, type SpotId, type SpotScene, type StoryChoice, type StoryContext } from './scenario';

export interface StoryView {
  text: string;
  choices: StoryChoice[];
}

/**
 * 状態スナップショット（StoryContext）から「いま表示すべき本文と選択肢」を決める。
 * 自身は状態を持たない（現在地・資源の正は GameState / SpotManager）。
 * N2 で章（時間帯）の進行状態がこのクラスに乗る予定のため、純関数ではなくクラスにしてある。
 */
export class StoryEngine {
  constructor(private readonly scenario: Record<SpotId, SpotScene> = SCENARIO) {}

  view(ctx: StoryContext): StoryView {
    const scene = this.scenario[ctx.spot];
    return {
      text: scene.text(ctx),
      choices: scene.choices.filter((choice) => choice.when?.(ctx) ?? true),
    };
  }
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm run test`
Expected: PASS（story.test.ts の全ケース + 既存テストすべて）

- [ ] **Step 6: コミット**

```bash
git add src/story/scenario.ts src/story/StoryEngine.ts tests/story.test.ts
git commit -m "feat: story scenario data and engine (pure logic, TDD)"
```

---

### Task 2: ui/StoryPanel.ts（画面下部のテキスト + 選択肢）

**Files:**
- Create: `src/ui/StoryPanel.ts`

**Interfaces:**
- Consumes: なし（DOM のみ。`#ui-root` に追加する）
- Produces: `StoryPanel` — `show(text: string, choiceLabels: string[], onChoose: (index: number) => void): void` / `setChoicesVisible(visible: boolean): void` / `setHidden(hidden: boolean): void`。Task 5 の main.ts が使う

- [ ] **Step 1: StoryPanel.ts を実装する**

DOM クラスのため単体テストは書かない（プロジェクト慣行。Task 6 のブラウザ通し確認で検証する）。
`src/ui/StoryPanel.ts` を作成する:

```typescript
const TEXT_FADE_SECONDS = 0.5;

/**
 * 画面下部中央のサウンドノベルパネル（本文 + 選択肢ボタン）。体験の入り口のため
 * IdleWatcher の消灯対象外。選択肢は実 button 要素（Tab 到達性）。
 * 演出中は setChoicesVisible(false) で選択肢だけ隠し、座り・スポット遷移・ヘルプ中は
 * setHidden(true) でパネルごと隠す（main.ts が毎フレーム合成する）。
 */
export class StoryPanel {
  private readonly container: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private readonly choicesEl: HTMLDivElement;
  private hidden = true; // タイトル画面の間は隠しておく（engine.start 後に main.ts が解除）

  constructor() {
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.left = '50%';
    this.container.style.bottom = '6%';
    this.container.style.transform = 'translateX(-50%)';
    this.container.style.width = 'min(90vw, 40rem)';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.gap = '0.7rem';
    this.container.style.padding = '1rem 1.4rem';
    this.container.style.background = 'rgba(0, 0, 0, 0.35)';
    this.container.style.border = '1px solid rgba(255, 255, 255, 0.18)';
    this.container.style.borderRadius = '12px';
    this.container.style.fontFamily = 'sans-serif';
    this.container.style.color = '#fff';
    this.container.style.pointerEvents = 'auto';
    this.container.style.opacity = '0';
    this.container.style.visibility = 'hidden';
    this.container.style.transition = `opacity ${TEXT_FADE_SECONDS}s ease`;

    this.textEl = document.createElement('div');
    this.textEl.style.fontSize = '1.05rem';
    this.textEl.style.lineHeight = '1.8';
    this.textEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';

    this.choicesEl = document.createElement('div');
    this.choicesEl.style.display = 'flex';
    this.choicesEl.style.flexDirection = 'column';
    this.choicesEl.style.alignItems = 'flex-start';
    this.choicesEl.style.gap = '0.35rem';

    this.container.append(this.textEl, this.choicesEl);
    document.getElementById('ui-root')?.appendChild(this.container);
  }

  /** 本文と選択肢を差し替える。選択肢は縦並びの実 button（クリック/タップ/Tab で選ぶ）。 */
  show(text: string, choiceLabels: string[], onChoose: (index: number) => void): void {
    this.textEl.textContent = text;
    this.choicesEl.replaceChildren();
    choiceLabels.forEach((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tk-button';
      button.textContent = `▶ ${label}`;
      button.style.padding = '0.35rem 0.9rem';
      button.style.fontSize = '0.98rem';
      button.style.fontFamily = 'sans-serif';
      button.style.color = '#fff';
      button.style.background = 'rgba(255, 255, 255, 0.08)';
      button.style.border = '1px solid rgba(255, 255, 255, 0.35)';
      button.style.borderRadius = '999px';
      button.style.cursor = 'pointer';
      button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(255, 255, 255, 0.2)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(255, 255, 255, 0.08)';
      });
      button.addEventListener('click', () => onChoose(index));
      this.choicesEl.appendChild(button);
    });
  }

  /** 演出（カメラパン・伐採・座り）中は選択肢だけ隠す（本文は残す）。 */
  setChoicesVisible(visible: boolean): void {
    this.choicesEl.style.display = visible ? 'flex' : 'none';
  }

  /** 座り・スポット遷移・ヘルプ表示中はパネルごと静かに消す。main.ts が毎フレーム合成する。 */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.container.style.opacity = hidden ? '0' : '1';
    // visibility はフェード完了を待たず即時に切り替えない（Tab フォーカスだけ即時に塞ぐ）
    if (hidden) {
      this.container.style.pointerEvents = 'none';
      window.setTimeout(() => {
        if (this.hidden) this.container.style.visibility = 'hidden';
      }, TEXT_FADE_SECONDS * 1000);
    } else {
      this.container.style.visibility = 'visible';
      this.container.style.pointerEvents = 'auto';
    }
  }
}
```

- [ ] **Step 2: ビルドとテストがグリーンであることを確認する**

Run: `npm run build && npm run test`
Expected: どちらも PASS（未使用クラスの追加のみ。`noUnusedLocals` はモジュール export には適用されない）

- [ ] **Step 3: コミット**

```bash
git add src/ui/StoryPanel.ts
git commit -m "feat: story panel UI (text + choice buttons)"
```

---

### Task 3: 演出の下地（LookControls / SitSequence / Chopping / Cooking / RestSpot への公開面追加）

既存の E キー経路を壊さない「追加のみ」の変更。既存関数のロジックは変えない。

**Files:**
- Modify: `src/pano/LookControls.ts`
- Modify: `src/foreground/SitSequence.ts`
- Modify: `src/foreground/Chopping.ts`
- Modify: `src/foreground/Cooking.ts`
- Modify: `src/foreground/RestSpot.ts`
- Modify: `src/main.ts`（SitSequence のコンストラクタ引数変更の追従のみ）

**Interfaces:**
- Produces（Task 4 の Direction・Task 5 の main.ts が使う）:
  - `LookControls.lookAt(yaw, pitch, seconds): Promise<void>` — ドラッグ中断・上書きでも必ず resolve するようになる
  - `SitSequence.start(opts: { lookDirection; durationSeconds?; coffee?; onEnd?: () => void })` — 立ち上がり完了時に onEnd が呼ばれる。コンストラクタから `interaction` 引数を削除
  - `Chopping.fell(): Promise<void>` / `Chopping.felled: boolean`（getter）
  - `Cooking.fillKettle(): void` / `Cooking.putOnFire(): void` / `Cooking.sitAndDrink(onEnd?: () => void): void`
  - `RestSpot.sit(gs: GameState, onEnd?: () => void): void`

- [ ] **Step 1: LookControls — アニメーション中断時に Promise を解決する**

現状 `onPointerDown` と `lookAt` の上書きで `animation = null` にすると resolve が呼ばれず、await している側が永遠に待つ。`src/pano/LookControls.ts` に private メソッドを追加し、2箇所から呼ぶ:

```typescript
  /** 進行中の lookAt アニメーションを中断する。await 側を進めるため必ず resolve する。 */
  private cancelAnimation(): void {
    if (this.animation) {
      this.animation.resolve();
      this.animation = null;
    }
  }
```

`onPointerDown` 内の `this.animation = null;` を `this.cancelAnimation();` に置き換える。
`lookAt()` 冒頭（`return new Promise` の中、`this.dragging = false;` の直前）に `this.cancelAnimation();` を追加する。

- [ ] **Step 2: SitSequence — onEnd コールバック追加と interaction 依存の除去**

`src/foreground/SitSequence.ts`:
- import から `import type { Interaction } from '../systems/Interaction';` を削除
- コンストラクタから `private readonly interaction: Interaction,` を削除
- `start` のシグネチャを変更し、コールバックを保持:

```typescript
  private onEndCallback: (() => void) | undefined;

  /** active 中の start は無視する（座りは同時に1つ）。onEnd は立ち上がり完了時に一度だけ呼ばれる。 */
  start(opts: {
    lookDirection: HotspotDirection;
    durationSeconds?: number;
    coffee?: GameState;
    onEnd?: () => void;
  }): void {
    if (this.active) return;
    this.onEndCallback = opts.onEnd;
    // （以降は既存のまま）
```

- `start` 内の `this.interaction.setEnabled(false);` を削除
- `end()` 内の `this.interaction.setEnabled(true);` を削除し、末尾にコールバック呼び出しを追加:

```typescript
  private end(): void {
    this.viewSteam.visible = false;
    this.lookControls.enabled = true;
    this.coffee?.drinkCoffee();
    this.timeline = null;
    this.coffee = undefined;
    const onEnd = this.onEndCallback;
    this.onEndCallback = undefined;
    onEnd?.();
  }
```

（座り中の E/クリック抑止は main.ts が毎フレーム `interaction.setEnabled(!cooking.isSitting && !help.isOpen)` で合成済みのため、挙動は変わらない）

- `src/main.ts` の SitSequence 生成を追従: `new SitSequence(lookControls, interaction, engine.camera, audio)` → `new SitSequence(lookControls, engine.camera, audio)`

- [ ] **Step 3: Chopping — 自動伐採シーケンスと felled getter**

`src/foreground/Chopping.ts`:
- 定数を追加: `const FELL_SWING_INTERVAL = 0.9; // 自動伐採の一振りの間隔（秒）`
- private フィールド `felled` を `treeFelled` にリネームし（クラス内の参照 3 箇所も追従）、getter とシーケンスを追加:

```typescript
  private fellSequence: { timer: number; resolve: () => void } | null = null;

  get felled(): boolean {
    return this.treeFelled;
  }

  /** 選択肢「木を切る」の自動演出。一定間隔で残り回数ぶん振り、伐倒音と薪加算（既存 onChop）まで進める。 */
  fell(): Promise<void> {
    if (this.treeFelled || this.fellSequence) return Promise.resolve();
    return new Promise((resolve) => {
      this.fellSequence = { timer: 0, resolve };
    });
  }
```

- `update` を変更:

```typescript
  update(dt: number): void {
    this.updateAxeSwing(dt);
    this.updateFellSequence(dt);
  }

  private updateFellSequence(dt: number): void {
    const seq = this.fellSequence;
    if (!seq) return;
    seq.timer -= dt;
    if (seq.timer > 0) return;
    seq.timer = FELL_SWING_INTERVAL;
    this.onChop(); // 一振り（音 + スイング + 残数減。最後の一振りで伐倒音 + 薪加算まで既存ロジックが走る）
    if (this.treeFelled) {
      this.fellSequence = null;
      seq.resolve();
    }
  }
```

- [ ] **Step 4: Cooking / RestSpot — 選択肢から呼ぶ公開メソッドを追加する**

`src/foreground/Cooking.ts` に追加（既存の Interactable 定義はこのタスクでは残す）:

```typescript
  /** 選択肢「川の水を汲む」（旧 waterHotspot.interact と同じ処理）。 */
  fillKettle(): void {
    if (this.gs.fillKettle()) {
      playWaterFill(this.audio.ctx, this.audio.master);
    }
  }

  /** 選択肢「ケトルを火にかける」。 */
  putOnFire(): void {
    this.gs.putKettleOnFire();
  }

  /** 選択肢「火のそばに座って一杯を飲む」。 */
  sitAndDrink(onEnd?: () => void): void {
    this.sitSequence.start({ lookDirection: this.fireLookDirection, coffee: this.gs, onEnd });
  }
```

`src/foreground/RestSpot.ts` に追加:

```typescript
  /** 選択肢「腰を下ろして眺める / 一杯を飲む」。coffeeAware かつ kettle==='ready' なら山頂の一杯になる。 */
  sit(gs: GameState, onEnd?: () => void): void {
    this.sitSequence.start({
      lookDirection: this.opts.lookDirection,
      coffee: this.isCoffeeMoment(gs) ? gs : undefined,
      onEnd,
    });
  }
```

（既存 `handleInteract` は `this.sit(gs)` を呼ぶ形に書き換えて重複を消す）

- [ ] **Step 5: ビルドとテストを確認する**

Run: `npm run build && npm run test`
Expected: どちらも PASS（既存挙動は不変。E キー経路もまだ動く）

- [ ] **Step 6: コミット**

```bash
git add src/pano/LookControls.ts src/foreground/SitSequence.ts src/foreground/Chopping.ts src/foreground/Cooking.ts src/foreground/RestSpot.ts src/main.ts
git commit -m "feat: groundwork for story direction (cancelable lookAt, fell sequence, sit onEnd)"
```

---

### Task 4: story/Direction.ts（演出ディスパッチャ）

**Files:**
- Create: `src/story/Direction.ts`

**Interfaces:**
- Consumes: Task 1 の `StoryChoice` / `SpotId`、Task 3 の `Chopping.fell` / `Cooking.fillKettle・putOnFire・sitAndDrink` / `RestSpot.sit` / `LookControls.lookAt`
- Produces: `Direction` — `run(choice: StoryChoice): Promise<void>` / `busy: boolean`。`DirectionDeps.travel` は main.ts が既存の遷移処理（足音・失敗時の巻き戻し込み）を包んで注入する

- [ ] **Step 1: Direction.ts を実装する**

Three.js 実体（カメラ・音・座り演出）に依存する薄いディスパッチのため単体テストは書かない（Task 6 の通し確認で全 action を実行して検証する）。`src/story/Direction.ts` を作成する:

```typescript
import type { Chopping } from '../foreground/Chopping';
import type { Cooking } from '../foreground/Cooking';
import type { RestSpot } from '../foreground/RestSpot';
import type { HotspotDirection } from '../pano/Hotspot';
import type { LookControls } from '../pano/LookControls';
import type { GameState } from '../systems/GameState';
import type { SpotId, StoryChoice } from './scenario';

const PAN_SECONDS = 1.4; // 選択後にカメラが対象へゆっくり向く時間（ドラッグで中断できる）

export interface DirectionDeps {
  lookControls: LookControls;
  gs: GameState;
  chopping: Chopping;
  cooking: Cooking;
  riversideRest: RestSpot;
  snowfieldRest: RestSpot;
  /** カメラパンの向き先（main.ts のプレイテスト済み定数を注入する）。 */
  directions: {
    tree: HotspotDirection;
    fire: HotspotDirection;
    kettle: HotspotDirection;
    water: HotspotDirection;
  };
  /** スポット遷移。足音・失敗時の環境音巻き戻し・失敗表示を含む既存処理を main.ts が包んで渡す。 */
  travel: (to: SpotId) => Promise<void>;
}

/**
 * 選択肢の演出指示（StoryEffect）を「カメラ自動パン + 既存の演出関数 + スポット遷移」へ変換して
 * 逐次実行する。実行中（busy）の再入は無視する。カメラパンはドラッグでいつでも中断できる
 * （LookControls.lookAt は中断時も resolve するため、演出はそのまま先へ進む）。
 */
export class Direction {
  private running = false;

  constructor(private readonly deps: DirectionDeps) {}

  get busy(): boolean {
    return this.running;
  }

  async run(choice: StoryChoice): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const effect = choice.effect;
      if (effect.kind === 'travel') {
        await this.deps.travel(effect.to);
        return;
      }
      switch (effect.action) {
        case 'chop':
          await this.pan(this.deps.directions.tree);
          await this.deps.chopping.fell();
          break;
        case 'feedFire':
          await this.pan(this.deps.directions.fire);
          this.deps.gs.feedFire();
          break;
        case 'fillKettle':
          await this.pan(this.deps.directions.water);
          this.deps.cooking.fillKettle();
          break;
        case 'putKettleOn':
          await this.pan(this.deps.directions.kettle);
          this.deps.cooking.putOnFire();
          break;
        case 'sitDrinkFire':
          await new Promise<void>((resolve) => this.deps.cooking.sitAndDrink(resolve));
          break;
        case 'sitRiverside':
          await new Promise<void>((resolve) => this.deps.riversideRest.sit(this.deps.gs, resolve));
          break;
        case 'sitSummit':
          await new Promise<void>((resolve) => this.deps.snowfieldRest.sit(this.deps.gs, resolve));
          break;
      }
    } finally {
      this.running = false;
    }
  }

  private pan(direction: HotspotDirection): Promise<void> {
    return this.deps.lookControls.lookAt(direction.yaw, direction.pitch, PAN_SECONDS);
  }
}
```

- [ ] **Step 2: ビルドとテストを確認する**

Run: `npm run build && npm run test`
Expected: どちらも PASS

- [ ] **Step 3: コミット**

```bash
git add src/story/Direction.ts
git commit -m "feat: direction dispatcher (choice effect to camera pan + performance)"
```

---

### Task 5: main.ts 切替 — E/レイキャスト対話の全廃・ノベル配線・不要コードの削除

体験の入り口を StoryPanel に一本化する切替タスク。ここで初めて旧経路を消す。

**Files:**
- Modify: `src/main.ts`
- Modify: `src/foreground/Chopping.ts`（hotspot 削除）
- Modify: `src/foreground/Cooking.ts`（Interactable / waterHotspot / HUD 依存の削除）
- Modify: `src/foreground/Fire.ts`（interactable 削除）
- Modify: `src/foreground/RestSpot.ts`（hotspot 削除）
- Modify: `src/pano/Hotspot.ts`（Hotspot クラス削除・座標ヘルパーだけ残す）
- Modify: `src/pano/HotspotMarker.ts`（setFocused の削除）
- Modify: `src/ui/HUD.ts`（中央プロンプト削除）
- Modify: `src/ui/AreaTitle.ts`（hint 引数をオプション化）
- Modify: `src/ui/Help.ts`（操作説明の文言更新）
- Delete: `src/systems/Interaction.ts`
- Delete: `src/ui/hints.ts`
- Delete: `tests/hints.test.ts`

**Interfaces:**
- Consumes: Task 1〜4 の全 Produces
- Produces: なし（最終配線）。完了時点で「Eキー・ホットスポットクリック・ナビボタン・中央プロンプト・hints」が存在しないこと

- [ ] **Step 1: 前景クラスから Interactable / Hotspot を撤去する**

- `Chopping.ts`: `readonly hotspot: Hotspot` とコンストラクタでの `new Hotspot(...)` / `scene.add(this.hotspot.object)` を削除。コンストラクタ引数から `direction: HotspotDirection, angularRadius: number` を削除（`scene` は不要になるため削除し、`camera` は斧ビューモデル用に残す）。import から `Hotspot` を外す
- `Fire.ts`: `readonly interactable: Interactable` の宣言・代入を削除。import から `Interactable` を外す（`prompt` 文言 `'Eで薪をくべる'` / `'薪がない。木を切ろう'` はここで消滅する）
- `Cooking.ts`: `fireKettleInteractable` / `waterHotspot` / hitbox 生成 / `promptFor` / `canInteractFor` / `handleInteract` / `onKettleChanged` の `hud.flashMessage(...)` 行を削除（`playChime` は残す）。コンストラクタから `hud: HUD` と `waterDirection` / `waterAngularRadius` 引数を削除。import から `Hotspot` / `Interactable` / `HUD` を外す。`COFFEE_READY_MESSAGE` 定数を削除
- `RestSpot.ts`: `readonly hotspot: Hotspot` / `new Hotspot(...)` / `scene.add` / `promptFor` / `handleInteract` を削除。コンストラクタから `scene` を削除。`RestSpotOptions` から `hotspotDirection` / `angularRadius` / `promptText` を削除（`lookDirection` / `coffeeAware` のみ残す）。`DEFAULT_PROMPT` / `COFFEE_PROMPT` 定数を削除
- `Hotspot.ts`: `Hotspot` クラスと `HotspotHandlers` を削除し、`HOTSPOT_DISTANCE` / `HotspotDirection` / `directionToPosition` / `positionToDirection` のみ残す（HotspotMarker と main.ts の座標変換が使う）。ファイル冒頭コメントを「パノラマ空間の方向（yaw/pitch）と座標の相互変換ヘルパー」に更新
- `HotspotMarker.ts`: `setFocused` メソッド・`focused` フィールド・`FOCUSED_OPACITY_SCALE` 定数と、update 内の focused による不透明度スケーリングを削除（`setAvailable` と呼吸パルスは残す）

- [ ] **Step 2: HUD / AreaTitle / Help を更新する**

- `HUD.ts`: `promptEl` の生成・append・`setPrompt` メソッドを削除（`flashMessage` / 所持品トレイ / `?` ボタン / `setIdle` は残す）
- `AreaTitle.ts`: `show(name: string, hint: string)` → `show(name: string, hint = '')` に変更（呼び出しは場所名のみになる。次の一歩の案内は StoryPanel の本文が担う）
- `Help.ts`: 操作方法の行 `'E またはクリック: 行動する'` を `'画面下の選択肢: 過ごし方を選ぶ'` に変更。クラスコメントの「E/クリックでの操作を止める」を「選択肢での操作を止める」に更新

- [ ] **Step 3: main.ts をノベル配線に書き換える**

変更点を順に（既存コメントの慣行に合わせ、変更理由は書かず制約のみ短く記す）:

1. import の差し替え:
   - 削除: `import { nextHint, SPOT_NAMES } from './ui/hints';` / `import { Interaction, type Interactable } from './systems/Interaction';`
   - 追加:
     ```typescript
     import { SPOT_NAMES, type MarkerId, type SpotId, type StoryChoice, type StoryContext } from './story/scenario';
     import { StoryEngine } from './story/StoryEngine';
     import { Direction } from './story/Direction';
     import { StoryPanel } from './ui/StoryPanel';
     ```
     （`SCENARIO` は StoryEngine のデフォルト引数のため main.ts では import しない）
2. `const interaction = new Interaction(...)` と `interaction.onBlocked(...)` を削除
3. 生成の追従: `new Chopping(engine.camera, audio, gs)`（scene/direction/angularRadius を外す）、`new Cooking(gs, audio, sitSequence, engine.scene, FIRE_POSITION, FIRE_LOOK_DIRECTION)`、`new RestSpot(sitSequence, { lookDirection: RIVERSIDE_VIEW_DIRECTION })`、`new RestSpot(sitSequence, { lookDirection: SNOWFIELD_VIEW_DIRECTION, coffeeAware: true })`
4. ノベル本体の生成と状態スナップショット:
   ```typescript
   const storyEngine = new StoryEngine();
   const storyPanel = new StoryPanel();

   function currentCtx(): StoryContext {
     return {
       spot: spotManager.current,
       logs: gs.logs,
       kettle: gs.kettle,
       fireLit: gs.fireFuel > 0,
       treeFelled: chopping.felled,
     };
   }
   ```
5. 遷移ラッパー（旧ナビボタンの click ハンドラの処理を移植）と Direction の生成:
   ```typescript
   async function travel(to: SpotId): Promise<void> {
     const departureSpot = SPOTS.find((s) => s.id === spotManager.current);
     const wasBusy = spotManager.busy;
     const transition = spotManager.transitionTo(to);
     // 遷移が実際に始まった（busy が false→true になった）ときだけ出発地の足音を鳴らす
     if (!wasBusy && spotManager.busy && departureSpot) {
       playFootsteps(audio.ctx, footstepsBus, GROUND_BY_SPOT[departureSpot.id], TRANSITION_STEP_COUNT);
     }
     const result = await transition;
     if (result.status === 'failed') {
       hud.flashMessage('たどり着けなかった。通信を確認してもう一度');
       // onApproach で先行フェードしていた環境音ミックスを出発地へ巻き戻す
       if (departureSpot) {
         ambientTargetSpot = departureSpot;
       }
     }
   }

   const direction = new Direction({
     lookControls,
     gs,
     chopping,
     cooking,
     riversideRest,
     snowfieldRest,
     directions: { tree: TREE_DIRECTION, fire: FIRE_LOOK_DIRECTION, kettle: positionToDirection(cooking.kettlePosition).direction, water: WATER_DIRECTION },
     travel,
   });
   ```
6. 表示更新（イベント駆動 + 内容が変わったときだけ差し替える）:
   ```typescript
   let lastStoryKey = '';
   function refreshStory(narration?: string): void {
     const view = storyEngine.view(currentCtx());
     const text = narration ?? view.text;
     const key = `${text}|${view.choices.map((c) => c.label).join('|')}`;
     if (key === lastStoryKey) return;
     lastStoryKey = key;
     storyPanel.show(text, view.choices.map((c) => c.label), (index) => {
       void chooseStory(view.choices[index]);
     });
   }

   async function chooseStory(choice: StoryChoice): Promise<void> {
     if (direction.busy || spotManager.busy || cooking.isSitting) return;
     storyPanel.setChoicesVisible(false);
     await direction.run(choice);
     storyPanel.setChoicesVisible(true);
     refreshStory(choice.narration);
   }

   gs.on('logs-changed', () => refreshStory());
   gs.on('kettle-changed', () => refreshStory());
   ```
7. マーカー再配線: `markerBindings` を `Array<{ marker: HotspotMarker; spotId: SpotId; markerId: MarkerId }>` に変更（interactable の代わりに markerId 文字列: tree/fire/kettle/water/riversideSeat/snowfieldSeat）。`currentSpotActions()` は選択肢ラベルの列挙に置き換え:
   ```typescript
   function currentSpotActions(): string[] {
     return storyEngine.view(currentCtx()).choices.map((choice) => choice.label);
   }
   ```
8. `updateHotspotsForSpot` から `interaction.remove/add` の列をすべて削除（`setVisible` の切替だけ残す）
9. ナビボタン一式を削除: `spotButtonsContainer` / `makeSpotButton` / `updateSpotButtons` と、IdleWatcher コールバック内・onUpdate 内のナビボタン参照（移動は選択肢になったため。idle 時も StoryPanel は消さない）
10. SpotManager の `onApply` コールバック: `updateSpotButtons();` を `refreshStory();` に、`areaTitle.show(SPOT_NAMES[spot.id], nextHint(gs, spot.id));` を `areaTitle.show(SPOT_NAMES[spot.id]);` に変更
11. onUpdate 内:
    - `interaction.setEnabled(...)` / `interaction.update()` / `hud.setPrompt(prompt)` を削除
    - 火の消え際でも本文が追従するよう fireLit のエッジ検出を追加:
      ```typescript
      let lastFireLit = false;
      // （onUpdate 内）
      const fireLitNow = gs.fireFuel > 0;
      if (fireLitNow !== lastFireLit) {
        lastFireLit = fireLitNow;
        refreshStory();
      }
      ```
    - パネルの合成表示（毎フレーム）: `storyPanel.setHidden(spotManager.busy || cooking.isSitting || help.isOpen);`
    - マーカー更新を選択肢連動に置き換え:
      ```typescript
      const view = storyEngine.view(currentCtx());
      const currentSpotId = spotManager.current;
      for (const { marker, spotId, markerId } of markerBindings) {
        const lit =
          !cooking.isSitting && spotId === currentSpotId && view.choices.some((c) => c.marker === markerId);
        marker.setAvailable(lit);
        marker.update(dt, engine.camera);
      }
      ```
12. Title の開始コールバック: `areaTitle.show(SPOT_NAMES[SPOTS[0].id], nextHint(gs, SPOTS[0].id));` を `areaTitle.show(SPOT_NAMES[SPOTS[0].id]);` にし、直後に `refreshStory();` と `storyPanel.setHidden(false);` を追加

- [ ] **Step 4: 旧ファイルを削除する**

```bash
git rm src/systems/Interaction.ts src/ui/hints.ts tests/hints.test.ts
```

- [ ] **Step 5: ビルドと全テストを確認する**

Run: `npm run build && npm run test`
Expected: どちらも PASS。`grep -rn "KeyE\|Eで\|Interactable" src/` がヒット 0 件であること（コメント含む残骸チェック。`grep -rn "nextHint" src/ tests/` も 0 件）

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat!: switch to sound novel interaction (remove E key, hotspots, nav buttons)"
```

---

### Task 6: ブラウザ通し確認（選択肢のみで全連鎖を完走）

**Files:**
- なし（検証のみ。発見した不具合の修正はこのタスク内で最小差分・都度コミット）

**Interfaces:**
- Consumes: 完成した N1 全体

- [ ] **Step 1: dev サーバーを起動する**

Run: `npm run dev`（バックグラウンド。ポートは出力の localhost URL を使う）

- [ ] **Step 2: ブラウザ操作ツール（Playwright 系）で初見シナリオを通す**

過去フェーズ（Phase D Task 4）と同じ方式で、実クリックのみで以下を順に確認する:

1. タイトル「はじめる」→ campsite 到着。AreaTitle に場所名、StoryPanel に「森のキャンプ地。焚き火の跡が残っている。薪はまだない。」と選択肢 3 つ（木を切る / 川辺へ向かう / 雪山へ向かう）が出る
2. 「木を切る」クリック → 選択肢が隠れ、カメラが木へパンし、斧音が 4 回 + 伐倒音（コンソールエラーなし）→ ナレーション「斧が四度響いた。…」+ 選択肢再表示（木を切る は消え、薪をくべる が出る）
3. 「焚き火に薪をくべる」→ 火が点く。本文が焚き火の描写に変わる
4. 「川辺へ向かう」→ 暗転遷移 + 足音、riverside 到着で本文・選択肢が川辺のものに変わる。遷移中はパネルが消えている
5. 「川の水を汲む」→ 注水音 → 「キャンプ地へ戻る」→「ケトルを火にかける」→ 待つ（約30秒）→ チャイムが鳴り本文が「湯気が立っている。コーヒーができた。」に変わる
6. 「雪山へ向かう」→「山頂で一杯を飲む」→ 座り演出 + sip 音 → 立ち上がり後、選択肢が「腰を下ろして稜線を眺める」に変わっている（kettle が empty に戻った）
7. 「キャンプ地へ戻る」→ 再度水汲みから抽出し、「火のそばに座って一杯を飲む」で campsite でも飲めることを確認
8. **E キーを押しても何も起きない**こと（pageerror ゼロ・状態変化なし）を確認
9. H キーでヘルプ開閉。「この場所でできること」に現在の選択肢ラベルが列挙されること、開いている間はパネルが隠れて選択できないことを確認
10. 演出中（カメラパン中）にドラッグして中断できること、中断しても演出が完了して選択肢が戻ることを確認
11. 8 秒無操作でナビ系 UI（音量・? ボタン・所持品）が消えても StoryPanel は残ることを確認
12. 全工程を通して pageerror / console error が 0 件であること

- [ ] **Step 3: 全テスト・ビルドの最終確認**

Run: `npm run build && npm run test`
Expected: PASS（テスト件数: 既存 63 − hints 11 + story 新規 ≒ 60 件前後）

- [ ] **Step 4: 発見事項があれば修正してコミット、なければ検証完了を記録**

```bash
git add -A
git commit -m "fix: n1 walkthrough findings"  # 修正があった場合のみ
```

---

### Task 7: 正典ドキュメントの更新

**Files:**
- Modify: `CLAUDE.md`（プロジェクトルート）
- Modify: `ROADMAP.md`
- Modify: `handoff.md`

**Interfaces:**
- Consumes: 設計書 v3 セクション 9（正典への影響）

- [ ] **Step 1: CLAUDE.md を v3 設計に合わせて更新する**

- 技術ルールの「移動機能は実装しない（見回し + スポット遷移のみ）」に「操作はクリック/タップの選択肢のみ（E キー等のアクションキーは持たない）」を追記
- 写真予算を改定: 「3枚合計35MB以下」→「1枚12MB以下・スポット単位の遅延ロード（計5枚 = 現行3 + 新規2）」
- 「体験の判断基準」の先頭を更新: 「ゲームではなく体験」→「静かなサウンドノベル。選択はあるが試練はない（数値ノルマ・失敗演出・警告UIは足さない）」
- 「誘導はプロンプト文言で静かに行う」→「誘導はシナリオ本文（情景だけを淡々と描く文体）で静かに行う」
- 正典ドキュメント（優先順)の 1 に `docs/superpowers/specs/2026-07-11-sound-novel-pivot-design.md`（v3・操作モデルと進行構造の正）を追加し、v2 は「映像・音・写真原則の正」として 2 に繰り下げ

- [ ] **Step 2: ROADMAP.md に N1〜N3 を追記する**

フェーズ表の末尾に追加（受け入れ条件つき）:
- N1（本計画・完了マーク）: サウンドノベル化。受け入れ = 選択肢クリックのみで全連鎖完走・E キー無効・build/test グリーン
- N2: 時間帯の物語駆動化（Grading プリセット + 朝 + 雪山フィナーレ + 幕）
- N3: 新スポット 2 箇所（写真先行調査 → 湖畔・森の小道）

- [ ] **Step 3: handoff.md を更新する**

「現在地」に N1 完了（テスト件数・通し確認済み・未 push なら明記）、「次のアクション」に N2 計画作成（writing-plans）を記す。

- [ ] **Step 4: コミット**

```bash
git add CLAUDE.md ROADMAP.md handoff.md
git commit -m "docs: update canon for sound novel pivot (N1 done)"
```

---

## Self-Review メモ（計画作成時に確認済み）

- 仕様カバレッジ: 設計書 v3 の N1 スコープ（セクション 3・4・7 の N1 相当 + セクション 9）を Task 1〜7 で網羅。時間帯・雪山フィナーレ・幕・新スポットは N2/N3 スコープのため対象外
- 型整合: `StoryChoice.effect` の判別 union は Task 1 定義 → Task 4/5 で同名参照。`Chopping.felled`（getter）/ `fell()` は Task 3 定義 → Task 4/5 で使用。`SitSequence.start` の `onEnd` は Task 3 定義 → Task 3 内 `sitAndDrink` / `sit` 経由で Task 4 が使用
- 既知の設計判断: 中央プロンプト（HUD.setPrompt）は完全撤去（StoryPanel が唯一の文字情報源）。`updateHotspotsForSpot` は表示切替のみ残るため、Task 5 実装時に関数名を `updateForegroundForSpot` へ変えてよい（コメントも追従）
- 選択肢「最大4つ」の保証は**到達可能な状態**に対してのみ（未伐倒で薪・火がある等の到達不可能な組み合わせでは campsite が5択になり得るが、プレイでは発生しない。網羅テストは reachable フィルタで到達可能な状態のみ検証する）
