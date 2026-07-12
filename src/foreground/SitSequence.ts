import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { playSip } from '../audio/synths';
import type { HotspotDirection } from '../pano/Hotspot';
import type { LookControls } from '../pano/LookControls';
import type { GameState } from '../systems/GameState';
import { SitTimeline } from './SitTimeline';

const SIT_TRANSITION_SECONDS = 1;

/** 画面下部に固定する、すすっている間だけ見える湯気スプライト用の柔らかいテクスチャ。 */
function createSteamTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * 座って視点を固定し、しばらく眺めて（コーヒー付きなら飲んで）立ち上がるまでの一連の演出。
 * campsite の焚き火（Cooking）・riverside/snowfield の休憩スポット（RestSpot）が共有する単一インスタンス
 * （座りは同時に1つ）。純ロジックは SitTimeline に委譲し、ここでは音・視点・湯気などの演出のみを扱う。
 */
export class SitSequence {
  private timeline: SitTimeline | null = null;
  private coffee: GameState | undefined;
  private savedYaw = 0;
  private savedPitch = 0;
  private onEndCallback: (() => void) | undefined;

  private readonly viewSteam: THREE.Sprite;

  constructor(
    private readonly lookControls: LookControls,
    camera: THREE.Camera,
    private readonly audio: AudioEngine
  ) {
    this.viewSteam = this.buildViewSteamSprite();
    camera.add(this.viewSteam);
  }

  get active(): boolean {
    return this.timeline?.active ?? false;
  }

  /** active 中の start は無視する（座りは同時に1つ）。ただし onEnd だけは即座に呼び、
   * 呼び出し側（Direction.run の await）を宙に浮かせない。 */
  start(opts: {
    lookDirection: HotspotDirection;
    durationSeconds?: number;
    coffee?: GameState;
    onEnd?: () => void;
  }): void {
    if (this.active) {
      opts.onEnd?.();
      return;
    }
    this.onEndCallback = opts.onEnd;

    this.coffee = opts.coffee;
    this.timeline = new SitTimeline({
      durationSeconds: opts.durationSeconds,
      withSips: opts.coffee !== undefined,
    });

    this.savedYaw = this.lookControls.currentYaw;
    this.savedPitch = this.lookControls.currentPitch;

    this.lookControls.enabled = false;
    void this.lookControls.lookAt(opts.lookDirection.yaw, opts.lookDirection.pitch, SIT_TRANSITION_SECONDS);

    if (this.coffee) {
      this.viewSteam.visible = true;
    }
  }

  update(dt: number): void {
    if (!this.timeline) return;

    const events = this.timeline.update(dt);
    for (const event of events) {
      switch (event) {
        case 'sip':
          playSip(this.audio.ctx, this.audio.master);
          break;
        case 'standup':
          void this.lookControls.lookAt(this.savedYaw, this.savedPitch, SIT_TRANSITION_SECONDS);
          break;
        case 'end':
          this.end();
          break;
      }
    }
  }

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

  /** 座って眺める/飲む間だけ画面下部に見える固定の湯気スプライト（コーヒー付きの座りのみ表示）。 */
  private buildViewSteamSprite(): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
      map: createSteamTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.4, 0.5, 1);
    sprite.position.set(0, -0.35, -0.5);
    sprite.visible = false;
    return sprite;
  }
}
