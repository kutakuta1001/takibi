export type SitEvent = 'sip' | 'standup' | 'end';

const DEFAULT_DURATION_SECONDS = 8;
const SIT_TRANSITION_SECONDS = 1;
const SIP_TIME_1 = 2.5;
const SIP_TIME_2 = 5;

/**
 * 座って眺める/飲む演出の純ロジック（Three.js・音に非依存、単体テスト対象）。
 * withSips=true のとき 2.5s と 5s に 'sip'。duration-1s に 'standup'、duration に 'end' を発生させる。
 * update() は「その dt で新たに発生したイベント」を発生順に配列で返す（大きな dt でも取り漏れない）。
 */
export class SitTimeline {
  private readonly durationSeconds: number;
  private readonly withSips: boolean;
  private readonly standUpAt: number;

  private elapsed = 0;
  private sipsPlayed = 0;
  private standUpTriggered = false;
  private ended = false;

  constructor(opts: { durationSeconds?: number; withSips: boolean }) {
    this.durationSeconds = opts.durationSeconds ?? DEFAULT_DURATION_SECONDS;
    this.withSips = opts.withSips;
    this.standUpAt = this.durationSeconds - SIT_TRANSITION_SECONDS;
  }

  get active(): boolean {
    return !this.ended;
  }

  update(dt: number): SitEvent[] {
    if (this.ended) return [];

    this.elapsed += dt;
    const events: SitEvent[] = [];

    if (this.withSips) {
      if (this.sipsPlayed === 0 && this.elapsed >= SIP_TIME_1) {
        events.push('sip');
        this.sipsPlayed = 1;
      }
      if (this.sipsPlayed === 1 && this.elapsed >= SIP_TIME_2) {
        events.push('sip');
        this.sipsPlayed = 2;
      }
    }

    if (!this.standUpTriggered && this.elapsed >= this.standUpAt) {
      this.standUpTriggered = true;
      events.push('standup');
    }

    if (this.elapsed >= this.durationSeconds) {
      this.ended = true;
      events.push('end');
    }

    return events;
  }
}
