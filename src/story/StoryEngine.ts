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
