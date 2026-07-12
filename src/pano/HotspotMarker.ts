import * as THREE from 'three';
import { directionToPosition, HOTSPOT_DISTANCE, type HotspotDirection } from './Hotspot';

const TEXTURE_SIZE = 128;
// 暖白色の柔らかい光点（「!」マーカーではなく「そこに何かある」気配の光）。
// 初回実装時は白に近すぎて木漏れ日・岩肌の反射と紛れたため、彩度を上げた琥珀色寄りに調整
// （スクリーンショットで確認した上での調整。詳細は報告に記載）。
const CORE_COLOR = 'rgba(255, 214, 140, 1)';
const MID_COLOR = 'rgba(255, 176, 90, 0.65)';
const EDGE_COLOR = 'rgba(255, 150, 60, 0)';

const BASE_OPACITY = 0.9;
const OPACITY_RESPONSE = 6; // 大きいほど出現/消灯が素早く追従する（ソフトに現れる程度に留める）

const PULSE_PERIOD_SECONDS = 3; // ゆっくり呼吸するパルス
const PULSE_SCALE_AMOUNT = 0.1; // ±10%

// 見た目のスケール基準。update() で実際のカメラ距離 × この係数 × パルスで sprite.scale を決める
// （配置距離が対象ごとに異なる=木・水汲みはHOTSPOT_DISTANCE、焚き火/ケトルはより近い実座標のため、
// 距離に比例させて画面上の見た目サイズを揃える）。初回0.06は小さすぎたため0.13へ拡大。
const ANGULAR_SIZE = 0.13;

function createMarkerTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      TEXTURE_SIZE / 2,
      TEXTURE_SIZE / 2,
      0,
      TEXTURE_SIZE / 2,
      TEXTURE_SIZE / 2,
      TEXTURE_SIZE / 2
    );
    gradient.addColorStop(0, CORE_COLOR);
    gradient.addColorStop(0.4, MID_COLOR);
    gradient.addColorStop(1, EDGE_COLOR);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * インタラクト可能な場所に灯す、柔らかい光のマーカー（Canvas放射グラデのスプライト）。
 * ホットスポットの当たり球（Hotspot.ts）と同じ方向+距離の変換規約を使い、同じ場所に光を置く。
 * Fire.ts の光の照り返し・火の粉と同じ考え方で toneMapped:false + AdditiveBlending にし、
 * グレーディング（時間帯）の濃淡に関わらず案内として視認できる明るさを保つ。
 */
export class HotspotMarker {
  private readonly sprite: THREE.Sprite;
  private available = false;
  private currentOpacity = 0;
  private time = 0;

  constructor(scene: THREE.Scene, direction: HotspotDirection, distance: number = HOTSPOT_DISTANCE) {
    const material = new THREE.SpriteMaterial({
      map: createMarkerTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.position.copy(directionToPosition(direction, distance));
    this.sprite.visible = false;
    scene.add(this.sprite);
  }

  /** いま出ている選択肢がこのマーカーを指しているときだけ表示する。 */
  setAvailable(on: boolean): void {
    this.available = on;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;

    const targetOpacity = this.available ? BASE_OPACITY : 0;
    const t = 1 - Math.exp(-OPACITY_RESPONSE * dt);
    this.currentOpacity += (targetOpacity - this.currentOpacity) * t;

    const material = this.sprite.material as THREE.SpriteMaterial;
    material.opacity = this.currentOpacity;
    this.sprite.visible = this.currentOpacity > 0.002;

    const pulse = 1 + Math.sin((this.time / PULSE_PERIOD_SECONDS) * Math.PI * 2) * PULSE_SCALE_AMOUNT;
    const distanceToCamera = this.sprite.position.distanceTo(camera.position);
    const scale = ANGULAR_SIZE * distanceToCamera * pulse;
    this.sprite.scale.set(scale, scale, 1);
  }
}
