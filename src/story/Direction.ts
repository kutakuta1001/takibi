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
