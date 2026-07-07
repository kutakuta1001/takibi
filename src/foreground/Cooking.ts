import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { playChime, playSip, playWaterFill } from '../audio/synths';
import { Hotspot, type HotspotDirection } from '../pano/Hotspot';
import type { LookControls } from '../pano/LookControls';
import type { GameState } from '../systems/GameState';
import type { Interactable, Interaction } from '../systems/Interaction';
import type { HUD } from '../ui/HUD';

type SitPhase = 'idle' | 'sitting';

const KETTLE_HEIGHT_ABOVE_FIRE = 1.0;
const KETTLE_HITBOX_SIZE = 1.2;

const SIT_TRANSITION_SECONDS = 1;
const SIT_LOCK_SECONDS = 8;
const STAND_UP_START = SIT_LOCK_SECONDS - SIT_TRANSITION_SECONDS;
const SIP_TIME_1 = 2.5;
const SIP_TIME_2 = 5;

const COFFEE_READY_MESSAGE = 'コーヒーができた';

const KETTLE_STEAM_COUNT = 20;
const KETTLE_STEAM_RISE_SPEED = 0.3;
const KETTLE_STEAM_MAX_RISE = 0.9;

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
 * 水汲み（riverside の水面ホットスポット）〜コーヒー（campsite の焚き火でケトルを沸かす〜座って飲む）
 * までを扱う（v1 systems/Cooking.ts + Water.ts から移植・統合）。
 * 座って飲む演出は、移動が無くなったことで v1 で見送っていた「視点がゆっくり下がり炎に向く」
 * 自動視点誘導（LookControls.lookAt）に置き換えた。終了後は元の視点に戻す。
 */
export class Cooking {
  readonly fireKettleInteractable: Interactable;
  readonly waterHotspot: Hotspot;

  private phase: SitPhase = 'idle';
  private sitElapsed = 0;
  private sipsPlayed = 0;
  private standUpTriggered = false;
  private savedYaw = 0;
  private savedPitch = 0;
  private spotVisible = true; // campsite にいる間だけ true（ケトルは焚き火の位置にあるため）

  private readonly kettleGroup: THREE.Group;
  private readonly kettleSteam: THREE.Points;
  private readonly viewSteam: THREE.Sprite;

  constructor(
    private readonly gs: GameState,
    private readonly hud: HUD,
    private readonly audio: AudioEngine,
    private readonly interaction: Interaction,
    private readonly lookControls: LookControls,
    scene: THREE.Scene,
    camera: THREE.Camera,
    firePosition: THREE.Vector3,
    private readonly fireLookDirection: HotspotDirection,
    waterDirection: HotspotDirection,
    waterAngularRadius: number
  ) {
    const kettlePosition = new THREE.Vector3(
      firePosition.x,
      firePosition.y + KETTLE_HEIGHT_ABOVE_FIRE,
      firePosition.z
    );

    this.kettleGroup = this.buildKettleMesh();
    this.kettleGroup.position.copy(kettlePosition);
    this.kettleGroup.visible = false;
    scene.add(this.kettleGroup);

    this.kettleSteam = this.buildKettleSteam();
    this.kettleSteam.position.copy(kettlePosition);
    this.kettleSteam.visible = false;
    scene.add(this.kettleSteam);

    this.viewSteam = this.buildViewSteamSprite();
    camera.add(this.viewSteam);

    const hitboxGeometry = new THREE.BoxGeometry(KETTLE_HITBOX_SIZE, KETTLE_HITBOX_SIZE, KETTLE_HITBOX_SIZE);
    const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
    hitbox.position.copy(kettlePosition);
    scene.add(hitbox);

    this.fireKettleInteractable = {
      object: hitbox,
      prompt: (state) => this.promptFor(state),
      canInteract: (state) => this.canInteractFor(state),
      interact: (state) => this.handleInteract(state),
    };

    this.waterHotspot = new Hotspot(waterDirection, waterAngularRadius, {
      prompt: (state) => (state.kettle === 'empty' ? 'Eで水を汲む' : ''),
      canInteract: (state) => state.kettle === 'empty',
      interact: (state) => {
        if (state.fillKettle()) {
          playWaterFill(this.audio.ctx, this.audio.master);
        }
      },
    });
    scene.add(this.waterHotspot.object);

    gs.on('kettle-changed', () => this.onKettleChanged());
  }

  /** main.ts が毎フレーム lookControls.enabled / interaction 有効状態を合成する際に使う。 */
  get isSitting(): boolean {
    return this.phase === 'sitting';
  }

  /** ケトルの表示/非表示（campsite にいる間だけ表示する。main.ts がスポット切替で呼ぶ）。 */
  setVisible(visible: boolean): void {
    this.spotVisible = visible;
  }

  update(dt: number): void {
    const brewing = this.gs.kettle === 'onFire' || this.gs.kettle === 'ready';
    this.kettleGroup.visible = this.spotVisible && brewing;
    this.kettleSteam.visible = this.spotVisible && brewing;
    if (brewing) {
      this.animateKettleSteam(dt);
    }

    if (this.phase === 'sitting') {
      this.updateSitSequence(dt);
    }
  }

  private promptFor(gs: GameState): string {
    switch (gs.kettle) {
      case 'empty':
        return '先に川で水を汲もう';
      case 'filled':
        return 'Eでケトルを火にかける';
      case 'onFire':
        return 'コーヒーを抽出中';
      case 'ready':
        return 'Eで座って飲む';
      default:
        return '';
    }
  }

  private canInteractFor(gs: GameState): boolean {
    if (this.phase !== 'idle') return false;
    return gs.kettle === 'filled' || gs.kettle === 'ready';
  }

  private handleInteract(gs: GameState): void {
    if (gs.kettle === 'filled') {
      gs.putKettleOnFire();
    } else if (gs.kettle === 'ready') {
      this.startSitSequence();
    }
  }

  private onKettleChanged(): void {
    if (this.gs.kettle === 'ready') {
      this.hud.flashMessage(COFFEE_READY_MESSAGE);
      playChime(this.audio.ctx, this.audio.master);
    }
  }

  private startSitSequence(): void {
    this.phase = 'sitting';
    this.sitElapsed = 0;
    this.sipsPlayed = 0;
    this.standUpTriggered = false;

    this.savedYaw = this.lookControls.currentYaw;
    this.savedPitch = this.lookControls.currentPitch;

    this.interaction.setEnabled(false);
    this.lookControls.enabled = false;
    void this.lookControls.lookAt(this.fireLookDirection.yaw, this.fireLookDirection.pitch, SIT_TRANSITION_SECONDS);

    this.viewSteam.visible = true;
  }

  private updateSitSequence(dt: number): void {
    this.sitElapsed += dt;

    if (this.sipsPlayed === 0 && this.sitElapsed >= SIP_TIME_1) {
      playSip(this.audio.ctx, this.audio.master);
      this.sipsPlayed = 1;
    } else if (this.sipsPlayed === 1 && this.sitElapsed >= SIP_TIME_2) {
      playSip(this.audio.ctx, this.audio.master);
      this.sipsPlayed = 2;
    }

    if (!this.standUpTriggered && this.sitElapsed >= STAND_UP_START) {
      this.standUpTriggered = true;
      void this.lookControls.lookAt(this.savedYaw, this.savedPitch, SIT_TRANSITION_SECONDS);
    }

    if (this.sitElapsed >= SIT_LOCK_SECONDS) {
      this.endSitSequence();
    }
  }

  private endSitSequence(): void {
    this.phase = 'idle';
    this.viewSteam.visible = false;
    this.interaction.setEnabled(true);
    this.lookControls.enabled = true;
    this.gs.drinkCoffee();
  }

  /** ケトルメッシュ（Cylinder=本体 + Torus半分=持ち手）。 */
  private buildKettleMesh(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x3a3a3a });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.28, 12), material);
    group.add(body);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 12, Math.PI), material);
    handle.position.y = 0.16;
    handle.rotation.x = Math.PI / 2;
    group.add(handle);

    return group;
  }

  private buildKettleSteam(): THREE.Points {
    const positions = new Float32Array(KETTLE_STEAM_COUNT * 3);
    for (let i = 0; i < KETTLE_STEAM_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 0.15;
      positions[i * 3 + 1] = Math.random() * KETTLE_STEAM_MAX_RISE;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.16,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    return new THREE.Points(geometry, material);
  }

  private animateKettleSteam(dt: number): void {
    const positions = this.kettleSteam.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      let y = positions.getY(i) + KETTLE_STEAM_RISE_SPEED * dt;
      if (y > KETTLE_STEAM_MAX_RISE) {
        y = 0;
        positions.setX(i, (Math.random() - 0.5) * 0.15);
        positions.setZ(i, (Math.random() - 0.5) * 0.15);
      }
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
  }

  /** 座ってコーヒーを飲む間だけ画面下部に見える固定の湯気スプライト。 */
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
