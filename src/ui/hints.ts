import type { Spot } from '../pano/SpotManager';
import type { GameState } from '../systems/GameState';

export type SpotId = Spot['id'];

/** AreaTitle・Help オーバーレイで使う場所名（正式名）。 */
export const SPOT_NAMES: Record<SpotId, string> = {
  campsite: 'キャンプ地 - 深い原生林',
  riverside: '川辺 - 渓谷の滝',
  snowfield: '雪山 - 三千メートルの稜線',
};

/**
 * 「次にできること」を一行で返す純関数（Three.js/DOM 非依存・GameState のゲッターのみ参照）。
 * campsite は薪→焚き火→水→ケトル→抽出→飲む、という体験連鎖の進み具合を上から順に判定する
 * （後段の分岐に来る時点で前段の条件は満たされていない、という前提の単純な if チェーン）。
 */
export function nextHint(gs: GameState, spot: SpotId): string {
  switch (spot) {
    case 'campsite': {
      if (gs.logs === 0 && gs.fireFuel === 0) return '木を切って薪を集めよう';
      if (gs.logs > 0 && gs.fireFuel === 0) return '焚き火に薪をくべよう';
      if (gs.kettle === 'empty') return '川辺へ水を汲みに行こう';
      if (gs.kettle === 'filled') return 'ケトルを焚き火にかけよう';
      if (gs.kettle === 'onFire') return 'コーヒーができるまで火のそばで待とう';
      return '焚き火のそばで飲もう。山頂まで持って行くのもいい'; // ready
    }
    case 'riverside': {
      if (gs.kettle === 'empty') return '水を汲める場所がある。滝を眺めて座れる岩場も';
      return '滝を眺めて座れる岩場がある';
    }
    case 'snowfield': {
      if (gs.kettle === 'ready') return '山頂で一杯を飲もう';
      return '腰を下ろして稜線を眺めよう';
    }
  }
}
