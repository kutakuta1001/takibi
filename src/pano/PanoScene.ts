import * as THREE from 'three';

const SPHERE_RADIUS = 50;
const SPHERE_WIDTH_SEGMENTS = 64;
const SPHERE_HEIGHT_SEGMENTS = 32;

/**
 * equirectangular JPGを反転球（内側から見えるよう反転させた球体）に貼り付けて表示する。
 * スポット（campsite / riverside）ごとに1インスタンス生成する。
 * MeshBasicMaterialは既にトーンマップ済みの実写JPGをそのまま出す用途のため、
 * レンダラーのACES Filmicトーンマッピングを二重に掛けないよう toneMapped=false にする。
 */
export class PanoScene {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  constructor(url: string) {
    const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS);
    geometry.scale(-1, 1, 1);

    const texture = new THREE.TextureLoader().load(url);
    texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false });
    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  /** 夕⇔夜のグレーディング（露出・色温度・彩度）を適用する。Grading.ts（P6）が実装するまではno-op。 */
  setGrading(_dayness: number): void {
    // P6: Grading.ts から呼ばれてシェーダで露出/色温度/彩度を補間する
  }
}
