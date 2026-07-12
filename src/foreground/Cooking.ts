import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { playChime, playWaterFill } from '../audio/synths';
import type { HotspotDirection } from '../pano/Hotspot';
import type { GameState } from '../systems/GameState';
import type { SitSequence } from './SitSequence';

const KETTLE_HEIGHT_ABOVE_FIRE = 1.0;

const KETTLE_STEAM_COUNT = 20;
const KETTLE_STEAM_RISE_SPEED = 0.3;
const KETTLE_STEAM_MAX_RISE = 0.9;

/**
 * 水汲み（riverside の水面ホットスポット）〜コーヒー（campsite の焚き火でケトルを沸かす〜座って飲む）
 * までを扱う（v1 systems/Cooking.ts + Water.ts から移植・統合）。
 * 座って飲む演出（視点誘導・湯気・sip音・立ち上がり）は SitSequence に委譲する
 * （riverside/snowfield の RestSpot と共有する単一インスタンス）。
 */
export class Cooking {
  readonly kettlePosition: THREE.Vector3; // HotspotMarker（main.ts）がケトルの実座標を必要とするため公開

  private spotVisible = true; // campsite にいる間だけ true（ケトルは焚き火の位置にあるため）

  private readonly kettleGroup: THREE.Group;
  private readonly kettleSteam: THREE.Points;

  constructor(
    private readonly gs: GameState,
    private readonly audio: AudioEngine,
    private readonly sitSequence: SitSequence,
    scene: THREE.Scene,
    firePosition: THREE.Vector3,
    private readonly fireLookDirection: HotspotDirection
  ) {
    const kettlePosition = new THREE.Vector3(
      firePosition.x,
      firePosition.y + KETTLE_HEIGHT_ABOVE_FIRE,
      firePosition.z
    );
    this.kettlePosition = kettlePosition;

    this.kettleGroup = this.buildKettleMesh();
    this.kettleGroup.position.copy(kettlePosition);
    this.kettleGroup.visible = false;
    scene.add(this.kettleGroup);

    this.kettleSteam = this.buildKettleSteam();
    this.kettleSteam.position.copy(kettlePosition);
    this.kettleSteam.visible = false;
    scene.add(this.kettleSteam);

    gs.on('kettle-changed', () => this.onKettleChanged());
  }

  /** main.ts が毎フレーム lookControls.enabled / StoryPanel の表示状態を合成する際に使う。 */
  get isSitting(): boolean {
    return this.sitSequence.active;
  }

  /** ケトルの表示/非表示（campsite にいる間だけ表示する。main.ts がスポット切替で呼ぶ）。 */
  setVisible(visible: boolean): void {
    this.spotVisible = visible;
  }

  /** 選択肢「川の水を汲む」（旧 waterHotspot.interact と同じ処理）。 */
  fillKettle(): void {
    if (this.gs.fillKettle()) {
      playWaterFill(this.audio.ctx, this.audio.master);
    }
  }

  /** 選択肢「ケトルを火にかける」。 */
  putOnFire(): void {
    this.gs.putKettleOnFire();
  }

  /** 選択肢「火のそばに座って一杯を飲む」。 */
  sitAndDrink(onEnd?: () => void): void {
    this.sitSequence.start({ lookDirection: this.fireLookDirection, coffee: this.gs, onEnd });
  }

  update(dt: number): void {
    const brewing = this.gs.kettle === 'onFire' || this.gs.kettle === 'ready';
    this.kettleGroup.visible = this.spotVisible && brewing;
    this.kettleSteam.visible = this.spotVisible && brewing;
    if (brewing) {
      this.animateKettleSteam(dt);
    }
  }

  private onKettleChanged(): void {
    if (this.gs.kettle === 'ready') {
      playChime(this.audio.ctx, this.audio.master);
    }
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
}
