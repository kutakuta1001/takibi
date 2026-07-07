import * as THREE from 'three';

const SPHERE_RADIUS = 50;
const SPHERE_WIDTH_SEGMENTS = 64;
const SPHERE_HEIGHT_SEGMENTS = 32;

const NIGHT_EXPOSURE = 0.25; // -2EV相当（2^-2）
const NIGHT_SATURATION = 0.6;
const NIGHT_TINT = new THREE.Vector3(0.75, 0.85, 1.15); // 青方偏移（R↓G→B↑）

/**
 * equirectangular JPGを反転球（内側から見えるよう反転させた球体）に貼り付けて表示する。
 * スポット（campsite / riverside）ごとに1インスタンス生成する。
 * MeshBasicMaterialは既にトーンマップ済みの実写JPGをそのまま出す用途のため、
 * レンダラーのACES Filmicトーンマッピングを二重に掛けないよう toneMapped=false にする。
 */
export class PanoScene {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  /** onLoad: 画像デコード完了時に呼ばれる（例: main.ts が scene.environment 用の PMREM を焼くタイミング）。 */
  constructor(url: string, onLoad?: (texture: THREE.Texture) => void) {
    const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS);
    geometry.scale(-1, 1, 1);

    const texture = new THREE.TextureLoader().load(url, onLoad);
    texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false });
    this.material.customProgramCacheKey = () => 'pano-grading';
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.dayness = { value: 1 };
      shader.uniforms.nightTint = { value: NIGHT_TINT };
      this.material.userData.gradingUniforms = shader.uniforms;

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float dayness;\nuniform vec3 nightTint;')
        .replace(
          '#include <map_fragment>',
          `
#include <map_fragment>
{
  // 露出: 夕(dayness=1)はベース写真のまま、夜(dayness=0)は-2EV相当に暗くする
  float exposure = mix(${NIGHT_EXPOSURE.toFixed(4)}, 1.0, dayness);
  vec3 graded = diffuseColor.rgb * exposure;

  // 彩度: 夜は${(NIGHT_SATURATION * 100).toFixed(0)}%まで落とす
  float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  graded = mix(vec3(luma), graded, mix(${NIGHT_SATURATION.toFixed(2)}, 1.0, dayness));

  // 色温度: 夜は青方偏移
  graded *= mix(nightTint, vec3(1.0), dayness);

  diffuseColor.rgb = graded;
}
`
        );
    };

    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  /** 夕⇔夜のグレーディング（露出・色温度・彩度）を適用する。dayness: 1=夕(ベース写真のまま)、0=夜。 */
  setGrading(dayness: number): void {
    const uniforms = this.material.userData.gradingUniforms as { dayness: { value: number } } | undefined;
    if (uniforms) {
      uniforms.dayness.value = THREE.MathUtils.clamp(dayness, 0, 1);
    }
  }
}
