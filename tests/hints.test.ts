import { describe, it, expect } from 'vitest';
import { GameState } from '../src/systems/GameState';
import { nextHint, SPOT_NAMES } from '../src/ui/hints';

describe('nextHint', () => {
  describe('campsite', () => {
    it('薪0・燃料0: 木を切って薪を集めよう', () => {
      const gs = new GameState();
      expect(nextHint(gs, 'campsite')).toBe('木を切って薪を集めよう');
    });

    it('薪あり・燃料0: 焚き火に薪をくべよう', () => {
      const gs = new GameState();
      gs.addLogs(1);
      expect(nextHint(gs, 'campsite')).toBe('焚き火に薪をくべよう');
    });

    it('燃料あり・ケトル空: 川辺へ水を汲みに行こう', () => {
      const gs = new GameState();
      gs.addLogs(1);
      gs.feedFire();
      expect(nextHint(gs, 'campsite')).toBe('川辺へ水を汲みに行こう');
    });

    it('ケトルfilled: ケトルを焚き火にかけよう', () => {
      const gs = new GameState();
      gs.addLogs(1);
      gs.feedFire();
      gs.fillKettle();
      expect(nextHint(gs, 'campsite')).toBe('ケトルを焚き火にかけよう');
    });

    it('ケトルonFire: コーヒーができるまで火のそばで待とう', () => {
      const gs = new GameState();
      gs.addLogs(1);
      gs.feedFire();
      gs.fillKettle();
      gs.putKettleOnFire();
      expect(nextHint(gs, 'campsite')).toBe('コーヒーができるまで火のそばで待とう');
    });

    it('ケトルready: 焚き火のそばで飲もう。山頂まで持って行くのもいい', () => {
      const gs = new GameState();
      gs.addLogs(1);
      gs.feedFire();
      gs.fillKettle();
      gs.putKettleOnFire();
      gs.tick(GameState.BREW_SECONDS);
      expect(nextHint(gs, 'campsite')).toBe('焚き火のそばで飲もう。山頂まで持って行くのもいい');
    });
  });

  describe('riverside', () => {
    it('ケトル空: 水を汲める場所がある。滝を眺めて座れる岩場も', () => {
      const gs = new GameState();
      expect(nextHint(gs, 'riverside')).toBe('水を汲める場所がある。滝を眺めて座れる岩場も');
    });

    it('ケトルfilled等: 滝を眺めて座れる岩場がある', () => {
      const gs = new GameState();
      gs.addLogs(1);
      gs.feedFire();
      gs.fillKettle();
      expect(nextHint(gs, 'riverside')).toBe('滝を眺めて座れる岩場がある');
    });
  });

  describe('snowfield', () => {
    it('ケトルready: 山頂で一杯を飲もう', () => {
      const gs = new GameState();
      gs.addLogs(1);
      gs.feedFire();
      gs.fillKettle();
      gs.putKettleOnFire();
      gs.tick(GameState.BREW_SECONDS);
      expect(nextHint(gs, 'snowfield')).toBe('山頂で一杯を飲もう');
    });

    it('その他: 腰を下ろして稜線を眺めよう', () => {
      const gs = new GameState();
      expect(nextHint(gs, 'snowfield')).toBe('腰を下ろして稜線を眺めよう');
    });
  });
});

describe('SPOT_NAMES', () => {
  it('has a display name for every spot', () => {
    expect(SPOT_NAMES.campsite).toBe('キャンプ地 - 深い原生林');
    expect(SPOT_NAMES.riverside).toBe('川辺 - 渓谷の滝');
    expect(SPOT_NAMES.snowfield).toBe('雪山 - 三千メートルの稜線');
  });
});
