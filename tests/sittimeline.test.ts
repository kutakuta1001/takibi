import { describe, it, expect } from 'vitest';
import { SitTimeline, type SitEvent } from '../src/foreground/SitTimeline';

describe('SitTimeline', () => {
  it('emits sip,sip,standup,end in order once each when stepping 0→8s with withSips=true', () => {
    const timeline = new SitTimeline({ withSips: true });
    const events: SitEvent[] = [];
    const STEP = 0.1;
    for (let t = 0; t < 8; t += STEP) {
      events.push(...timeline.update(STEP));
    }
    // 最終ステップで残り(8 - 最後の t)分をさらに進め、8s ちょうどに到達させる
    events.push(...timeline.update(8 - Math.floor(8 / STEP) * STEP || 0));

    expect(events).toEqual(['sip', 'sip', 'standup', 'end']);
  });

  it('never emits sip when withSips=false', () => {
    const timeline = new SitTimeline({ withSips: false });
    const events: SitEvent[] = [];
    for (let t = 0; t < 8; t += 0.1) {
      events.push(...timeline.update(0.1));
    }
    expect(events).not.toContain('sip');
    expect(events).toEqual(['standup', 'end']);
  });

  it('returns every event exactly once in order even with a large dt (e.g. 10)', () => {
    const timeline = new SitTimeline({ withSips: true });
    const events = timeline.update(10);
    expect(events).toEqual(['sip', 'sip', 'standup', 'end']);
  });

  it('becomes inactive after end and returns no further events', () => {
    const timeline = new SitTimeline({ withSips: true });
    timeline.update(10);
    expect(timeline.active).toBe(false);
    expect(timeline.update(1)).toEqual([]);
  });

  it('respects a custom durationSeconds for standup/end timing', () => {
    const timeline = new SitTimeline({ withSips: false, durationSeconds: 4 });
    const events = timeline.update(4);
    expect(events).toEqual(['standup', 'end']);
  });
});
