import * as THREE from 'three';
import Alea from 'alea';

// 雄大な雪山（Phase S5・Piz d'Err）に合わせて600→900に増量。
const TOTAL_PARTICLE_COUNT = 900;
// カメラ（原点固定）を中心とした円柱状の空間に粒を配置する。パノラマ球（半径50）より
// ずっと手前の近距離に留めることで、遠景の雪山写真と混同されず「今そこに降っている」感を出す。
// MIN_RADIUS を設けず0まで許すと、ごく稀にカメラの目の前（≒レンズにほぼ密着）に粒が湧き、
// sizeAttenuationの遠近スケールで異様に巨大な丸として映る不具合が起きるため下限を設ける。
const VOLUME_MIN_RADIUS = 2.5;
const VOLUME_RADIUS = 14;
const VOLUME_TOP = 12;
const VOLUME_BOTTOM = -6;
const FALL_SPEED_MIN = 1.0;
const FALL_SPEED_MAX = 2.6;
const SWAY_AMPLITUDE_MIN = 0.2;
const SWAY_AMPLITUDE_MAX = 0.45;
const SWAY_SPEED_MIN = 0.6;
const SWAY_SPEED_MAX = 1.4;
const SNOWFLAKE_TEXTURE_SIZE = 32;
// Gusts.strength（0..1）に応じて雪を一方向へ流す最大オフセット。基礎風0.3前後では控えめ、
// 突風時（0.8超）だけ「風に流れる」とはっきり気づける程度まで強める。
const WIND_DRIFT_MAX = 1.1;

interface SizeGroupSpec {
  size: number;
  opacity: number;
  fraction: number; // TOTAL_PARTICLE_COUNT に対する比率（3グループ合計で1になるようにする）
}

// PointsMaterial は1マテリアルにつきサイズを1つしか持てない（頂点ごとのサイズはシェーダ拡張が
// 必要）ため、サイズ・不透明度違いの THREE.Points を3層重ねて粒のばらつきを表現する
// （小さく薄い粒=遠くの雪、大きく濃い粒=近くの雪、という奥行き感も自然に出る）。
const SIZE_GROUPS: readonly SizeGroupSpec[] = [
  { size: 0.05, opacity: 0.5, fraction: 0.45 },
  { size: 0.09, opacity: 0.75, fraction: 0.35 },
  { size: 0.14, opacity: 0.9, fraction: 0.2 },
];

/**
 * 放射状グラデーションの円形ソフト粒子テクスチャ（Fire.ts の createShadowDecalTexture と同じ手法）。
 * PointsMaterial は map なしだと正方形の点を描くため、これを貼ることで丸い雪片らしい輪郭にする。
 */
function createSnowflakeTexture(): THREE.CanvasTexture {
  const size = SNOWFLAKE_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

interface SnowGroup {
  points: THREE.Points;
  count: number;
  baseX: Float32Array;
  baseZ: Float32Array;
  fallSpeeds: Float32Array;
  swayAmplitudes: Float32Array;
  swaySpeeds: Float32Array;
  swayPhases: Float32Array;
}

/**
 * カメラを中心とした円柱状の空間に降る雪のパーティクル（THREE.Points を3層）。
 * 各粒はやや異なる落下速度とサイン波の左右ゆらぎを持ち、下限（VOLUME_BOTTOM）に
 * 達したら上限（VOLUME_TOP）へワープして無限降雪に見せる。snowfield スポットに
 * 滞在中のみ setEnabled(true) にする想定（他スポットでは非表示・更新スキップ）。
 */
export class Snowfall {
  private enabled = false;
  private time = 0;
  private readonly groups: SnowGroup[] = [];

  constructor(scene: THREE.Scene) {
    const rand = Alea('takibi-snowfall');
    const texture = createSnowflakeTexture();

    let allocated = 0;
    for (let groupIndex = 0; groupIndex < SIZE_GROUPS.length; groupIndex++) {
      const spec = SIZE_GROUPS[groupIndex];
      // 最後のグループは丸め誤差を吸収し、合計が TOTAL_PARTICLE_COUNT に一致するようにする。
      const count =
        groupIndex === SIZE_GROUPS.length - 1
          ? TOTAL_PARTICLE_COUNT - allocated
          : Math.round(TOTAL_PARTICLE_COUNT * spec.fraction);
      allocated += count;

      const group = this.buildGroup(rand, texture, spec, count);
      scene.add(group.points);
      this.groups.push(group);
    }
  }

  private buildGroup(rand: () => number, texture: THREE.Texture, spec: SizeGroupSpec, count: number): SnowGroup {
    const positions = new Float32Array(count * 3);
    const baseX = new Float32Array(count);
    const baseZ = new Float32Array(count);
    const fallSpeeds = new Float32Array(count);
    const swayAmplitudes = new Float32Array(count);
    const swaySpeeds = new Float32Array(count);
    const swayPhases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      // 環状（VOLUME_MIN_RADIUS〜VOLUME_RADIUS）の面積が均一になるよう平方根で補正した半径。
      const radius = Math.sqrt(VOLUME_MIN_RADIUS ** 2 + rand() * (VOLUME_RADIUS ** 2 - VOLUME_MIN_RADIUS ** 2));
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = VOLUME_BOTTOM + rand() * (VOLUME_TOP - VOLUME_BOTTOM);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      baseX[i] = x;
      baseZ[i] = z;
      fallSpeeds[i] = FALL_SPEED_MIN + rand() * (FALL_SPEED_MAX - FALL_SPEED_MIN);
      swayAmplitudes[i] = SWAY_AMPLITUDE_MIN + rand() * (SWAY_AMPLITUDE_MAX - SWAY_AMPLITUDE_MIN);
      swaySpeeds[i] = SWAY_SPEED_MIN + rand() * (SWAY_SPEED_MAX - SWAY_SPEED_MIN);
      swayPhases[i] = rand() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: texture,
      color: 0xffffff,
      size: spec.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false,
      blending: THREE.NormalBlending, // 加算合成にすると重なりが白飛びして雪片らしさが失われるため通常合成
      toneMapped: false,
    });

    const points = new THREE.Points(geometry, material);
    points.visible = false;

    return { points, count, baseX, baseZ, fallSpeeds, swayAmplitudes, swaySpeeds, swayPhases };
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const group of this.groups) {
      group.points.visible = on;
    }
  }

  /** windStrength は Gusts.strength（0..1）を想定。省略時は0（無風）として既存挙動のまま。 */
  update(dt: number, windStrength: number = 0): void {
    if (!this.enabled) return;
    this.time += dt;
    const drift = windStrength * WIND_DRIFT_MAX;

    for (const group of this.groups) {
      const position = group.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < group.count; i++) {
        let y = position.getY(i) - group.fallSpeeds[i] * dt;
        if (y < VOLUME_BOTTOM) {
          y = VOLUME_TOP;
        }
        const sway = Math.sin(this.time * group.swaySpeeds[i] + group.swayPhases[i]) * group.swayAmplitudes[i];
        position.setX(i, group.baseX[i] + sway + drift);
        position.setY(i, y);
        position.setZ(i, group.baseZ[i]);
      }
      position.needsUpdate = true;
    }
  }
}
