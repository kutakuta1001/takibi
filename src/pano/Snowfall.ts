import * as THREE from 'three';
import Alea from 'alea';

const PARTICLE_COUNT = 600;
// カメラ（原点固定）を中心とした円柱状の空間に粒を配置する。パノラマ球（半径50）より
// ずっと手前の近距離に留めることで、遠景の雪山写真と混同されず「今そこに降っている」感を出す。
const VOLUME_RADIUS = 14;
const VOLUME_TOP = 12;
const VOLUME_BOTTOM = -6;
const FALL_SPEED_MIN = 1.2;
const FALL_SPEED_MAX = 2.4;
const SWAY_AMPLITUDE_MIN = 0.2;
const SWAY_AMPLITUDE_MAX = 0.4;
const SWAY_SPEED_MIN = 0.6;
const SWAY_SPEED_MAX = 1.4;

/**
 * カメラを中心とした円柱状の空間に降る雪のパーティクル（THREE.Points）。
 * 各粒はやや異なる落下速度とサイン波の左右ゆらぎを持ち、下限（VOLUME_BOTTOM）に
 * 達したら上限（VOLUME_TOP）へワープして無限降雪に見せる。snowfield スポットに
 * 滞在中のみ setEnabled(true) にする想定（他スポットでは非表示・更新スキップ）。
 */
export class Snowfall {
  readonly points: THREE.Points;
  private enabled = false;
  private time = 0;

  private readonly baseX: Float32Array;
  private readonly baseZ: Float32Array;
  private readonly fallSpeeds: Float32Array;
  private readonly swayAmplitudes: Float32Array;
  private readonly swaySpeeds: Float32Array;
  private readonly swayPhases: Float32Array;

  constructor(scene: THREE.Scene) {
    const rand = Alea('takibi-snowfall');
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    this.baseX = new Float32Array(PARTICLE_COUNT);
    this.baseZ = new Float32Array(PARTICLE_COUNT);
    this.fallSpeeds = new Float32Array(PARTICLE_COUNT);
    this.swayAmplitudes = new Float32Array(PARTICLE_COUNT);
    this.swaySpeeds = new Float32Array(PARTICLE_COUNT);
    this.swayPhases = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(rand()) * VOLUME_RADIUS; // 面積が均一になるようsqrtで補正
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = VOLUME_BOTTOM + rand() * (VOLUME_TOP - VOLUME_BOTTOM);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      this.baseX[i] = x;
      this.baseZ[i] = z;
      this.fallSpeeds[i] = FALL_SPEED_MIN + rand() * (FALL_SPEED_MAX - FALL_SPEED_MIN);
      this.swayAmplitudes[i] = SWAY_AMPLITUDE_MIN + rand() * (SWAY_AMPLITUDE_MAX - SWAY_AMPLITUDE_MIN);
      this.swaySpeeds[i] = SWAY_SPEED_MIN + rand() * (SWAY_SPEED_MAX - SWAY_SPEED_MIN);
      this.swayPhases[i] = rand() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.visible = false;
    scene.add(this.points);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.points.visible = on;
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.time += dt;

    const position = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let y = position.getY(i) - this.fallSpeeds[i] * dt;
      if (y < VOLUME_BOTTOM) {
        y = VOLUME_TOP;
      }
      const sway = Math.sin(this.time * this.swaySpeeds[i] + this.swayPhases[i]) * this.swayAmplitudes[i];
      position.setX(i, this.baseX[i] + sway);
      position.setY(i, y);
      position.setZ(i, this.baseZ[i]);
    }
    position.needsUpdate = true;
  }
}
