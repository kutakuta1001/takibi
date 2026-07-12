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
