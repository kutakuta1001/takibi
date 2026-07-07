import * as THREE from 'three';
import { EYE_HEIGHT } from '../core/PlayerController';
import type { PlayerController } from '../core/PlayerController';
import type { AudioEngine } from '../audio/AudioEngine';
import { playChime, playSip } from '../audio/synths';
import type { HUD } from '../ui/HUD';
import type { Fire } from './Fire';
import type { GameState } from './GameState';
import type { Interactable, Interaction } from './Interaction';

type SitPhase = 'idle' | 'sitting';

const KETTLE_HEIGHT_ABOVE_FIRE = 1.0;
const KETTLE_HITBOX_SIZE = 1.2;

const SIT_HEIGHT = 0.9;
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
 * 水入りケトルを焚き火にかけてコーヒーを淹れ、完成後に座って飲むまでの一連を扱う。
 * 焚き火の「薪をくべる」（Fire.interactable）とは別に、ケトル操作用のヒットボックスを
 * 焚き火の少し上（ケトルを置く高さ）に用意することで、同じ焚き火エリアで両方の操作を両立させる。
 */
export class Cooking {
  readonly fireKettleInteractable: Interactable;

  private phase: SitPhase = 'idle';
  private sitElapsed = 0;
  private sipsPlayed = 0;

  private readonly kettleGroup: THREE.Group;
  private readonly kettleSteam: THREE.Points;
  private readonly viewSteam: THREE.Sprite;

  constructor(
    private readonly gs: GameState,
    private readonly fire: Fire,
    private readonly hud: HUD,
    private readonly audio: AudioEngine,
    private readonly playerController: PlayerController,
    private readonly interaction: Interaction,
    scene: THREE.Scene,
    private readonly camera: THREE.Camera
  ) {
    const kettlePosition = new THREE.Vector3(
      fire.position.x,
      fire.position.y + KETTLE_HEIGHT_ABOVE_FIRE,
      fire.position.z
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

    gs.on('kettle-changed', () => this.onKettleChanged());
  }

  update(dt: number): void {
    const brewing = this.gs.kettle === 'onFire' || this.gs.kettle === 'ready';
    this.kettleGroup.visible = brewing;
    this.kettleSteam.visible = brewing;
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
    this.playerController.setMovementLocked(true);
    this.interaction.setEnabled(false);
    this.viewSteam.visible = true;
  }

  private updateSitSequence(dt: number): void {
    this.sitElapsed += dt;

    // 移動ロック中は bob が入らないため position.y は heightAt(x,z)+EYE_HEIGHT のまま。
    // そこから地面の高さだけを逆算し、座高で上書きする。
    const groundY = this.playerController.position.y - EYE_HEIGHT;
    const eyeHeight = this.currentEyeHeight();
    this.playerController.position.y = groundY + eyeHeight;
    this.camera.position.copy(this.playerController.position);

    if (this.sipsPlayed === 0 && this.sitElapsed >= SIP_TIME_1) {
      playSip(this.audio.ctx, this.audio.master);
      this.sipsPlayed = 1;
    } else if (this.sipsPlayed === 1 && this.sitElapsed >= SIP_TIME_2) {
      playSip(this.audio.ctx, this.audio.master);
      this.sipsPlayed = 2;
    }

    if (this.sitElapsed >= SIT_LOCK_SECONDS) {
      this.endSitSequence();
    }
  }

  private currentEyeHeight(): number {
    if (this.sitElapsed < SIT_TRANSITION_SECONDS) {
      return THREE.MathUtils.lerp(EYE_HEIGHT, SIT_HEIGHT, this.sitElapsed / SIT_TRANSITION_SECONDS);
    }
    if (this.sitElapsed < STAND_UP_START) {
      return SIT_HEIGHT;
    }
    if (this.sitElapsed < SIT_LOCK_SECONDS) {
      return THREE.MathUtils.lerp(SIT_HEIGHT, EYE_HEIGHT, (this.sitElapsed - STAND_UP_START) / SIT_TRANSITION_SECONDS);
    }
    return EYE_HEIGHT;
  }

  private endSitSequence(): void {
    this.phase = 'idle';
    this.viewSteam.visible = false;
    this.playerController.setMovementLocked(false);
    this.interaction.setEnabled(true);
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
