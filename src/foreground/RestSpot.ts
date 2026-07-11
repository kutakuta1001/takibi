import * as THREE from 'three';
import { Hotspot, type HotspotDirection } from '../pano/Hotspot';
import type { GameState } from '../systems/GameState';
import type { SitSequence } from './SitSequence';

const DEFAULT_PROMPT = 'Eで座って眺める';
const COFFEE_PROMPT = 'Eで座って一杯を飲む';

export interface RestSpotOptions {
  hotspotDirection: HotspotDirection; // 座れる場所（岩・倒木など写真内の自然な座り場）
  angularRadius: number;
  lookDirection: HotspotDirection; // 座って眺める先
  promptText?: string; // 既定「Eで座って眺める」
  coffeeAware?: boolean; // true かつ kettle==='ready' なら「座って一杯を飲む」に切り替わる（山頂の一杯）
}

/**
 * riverside/snowfield で「座って眺める」ための休憩スポット。座りの実体は campsite の Cooking と
 * 共有する単一の SitSequence（座りは同時に1つ）。coffeeAware は snowfield の「山頂の一杯」用
 * （campsite で淹れたコーヒーはグローバルな GameState.kettle 経由でここでも 'ready' を検知できる）。
 */
export class RestSpot {
  readonly hotspot: Hotspot;

  constructor(
    scene: THREE.Scene,
    private readonly sitSequence: SitSequence,
    private readonly opts: RestSpotOptions
  ) {
    this.hotspot = new Hotspot(opts.hotspotDirection, opts.angularRadius, {
      prompt: (gs) => this.promptFor(gs),
      canInteract: () => !this.sitSequence.active,
      interact: (gs) => this.handleInteract(gs),
    });
    scene.add(this.hotspot.object);
  }

  private isCoffeeMoment(gs: GameState): boolean {
    return Boolean(this.opts.coffeeAware) && gs.kettle === 'ready';
  }

  private promptFor(gs: GameState): string {
    return this.isCoffeeMoment(gs) ? COFFEE_PROMPT : this.opts.promptText ?? DEFAULT_PROMPT;
  }

  private handleInteract(gs: GameState): void {
    this.sitSequence.start({
      lookDirection: this.opts.lookDirection,
      coffee: this.isCoffeeMoment(gs) ? gs : undefined,
    });
  }
}
