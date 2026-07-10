import * as THREE from 'three';

const CYCLE_SECONDS = 4; // 約4秒周期
const MAX_OPACITY = 0.12; // 効果として気づかれない控えめさ（品質原則により厳守）
const TEXTURE_SIZE = 64;
// カメラのローカル座標（カメラは常に(0,0,0)・forwardは-Z）。視界下部やや前方に置く。
const BASE_LOCAL_POSITION = new THREE.Vector3(0, -0.35, -0.6);
const BASE_SCALE = 0.5;
const DRIFT_MAX = 0.15; // 息が漂って少し上がる量
const SCALE_GROWTH = 0.6; // 消えるまでにわずかに滲んで広がる比率

/** 息の白い霧テクスチャ（放射状グラデの円形ソフト粒子。Fire.ts/Snowfall.tsと同じ手法）。 */
function createBreathTexture(): THREE.CanvasTexture {
  const size = TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.4)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * 雪山でのみ有効にする白い息。camera の子として視界下部やや前方に置いた円形スプライトを
 * 約4秒周期で現れて消えさせる（不透明度は最大0.12。「効果として気づかれたら強すぎる」を厳守）。
 * camera.add() で親子付けするため、main.ts が既に camera を scene に入れている前提に乗る
 * （斧ビューモデル等と同じ既存の技法。scene 引数は他の前景クラスと構成を揃えるために受け取るが未使用）。
 */
export class Breath {
  private enabled = false;
  private time = 0;
  private readonly sprite: THREE.Sprite;

  constructor(_scene: THREE.Scene, camera: THREE.Camera) {
    const material = new THREE.SpriteMaterial({
      map: createBreathTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.position.copy(BASE_LOCAL_POSITION);
    this.sprite.scale.setScalar(BASE_SCALE);
    this.sprite.visible = false;
    camera.add(this.sprite);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.sprite.visible = on;
    if (!on) {
      this.time = 0;
      (this.sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.time += dt;

    const phase = (this.time % CYCLE_SECONDS) / CYCLE_SECONDS; // 0..1
    const shape = Math.sin(phase * Math.PI); // 0→1→0 の片山（現れて消える一息分）

    const material = this.sprite.material as THREE.SpriteMaterial;
    material.opacity = shape * MAX_OPACITY;

    this.sprite.position.set(
      BASE_LOCAL_POSITION.x,
      BASE_LOCAL_POSITION.y + phase * DRIFT_MAX,
      BASE_LOCAL_POSITION.z
    );
    this.sprite.scale.setScalar(BASE_SCALE * (1 + phase * SCALE_GROWTH));
  }
}
