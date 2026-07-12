import type { HotspotDirection } from '../pano/Hotspot';
import type { GameState } from '../systems/GameState';
import type { SitSequence } from './SitSequence';

export interface RestSpotOptions {
  lookDirection: HotspotDirection; // 座って眺める先
  coffeeAware?: boolean; // true かつ kettle==='ready' なら「座って一杯を飲む」に切り替わる（山頂の一杯）
}

/**
 * riverside/snowfield で「座って眺める」ための休憩スポット。座りの実体は campsite の Cooking と
 * 共有する単一の SitSequence（座りは同時に1つ）。coffeeAware は snowfield の「山頂の一杯」用
 * （campsite で淹れたコーヒーはグローバルな GameState.kettle 経由でここでも 'ready' を検知できる）。
 */
export class RestSpot {
  constructor(
    private readonly sitSequence: SitSequence,
    private readonly opts: RestSpotOptions
  ) {}

  private isCoffeeMoment(gs: GameState): boolean {
    return Boolean(this.opts.coffeeAware) && gs.kettle === 'ready';
  }

  /** 選択肢「腰を下ろして眺める / 一杯を飲む」。coffeeAware かつ kettle==='ready' なら山頂の一杯になる。 */
  sit(gs: GameState, onEnd?: () => void): void {
    this.sitSequence.start({
      lookDirection: this.opts.lookDirection,
      coffee: this.isCoffeeMoment(gs) ? gs : undefined,
      onEnd,
    });
  }
}
