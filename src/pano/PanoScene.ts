import * as THREE from 'three';

const SPHERE_RADIUS = 50;
const SPHERE_WIDTH_SEGMENTS = 64;
const SPHERE_HEIGHT_SEGMENTS = 32;

export interface NightGrading {
  exposure: number; // 夜(dayness=0)の露出倍率。1.0で無変化、小さいほど暗くなる
  saturation: number; // 夜の彩度倍率（0=完全グレー、1=無変化）
  tint: THREE.Vector3; // 夜の色温度シフト（R,G,B倍率。R↓G→B↑で青方偏移）
  lift: number; // 夜の黒レベルの下限（0=リフトなし）。明暗差の大きい写真では影が黒潰れしないよう底上げする
}

// forest系（campsite/riverside）のベース値。露出低下量は各パノラマの元の色調に合わせて
// Phase S1/S2 でプレイテストしながら調整済み（黒潰れしない範囲で最も夜らしく見える値）。
const DEFAULT_NIGHT_GRADING: NightGrading = {
  exposure: 0.25, // -2EV相当（2^-2）
  saturation: 0.6,
  tint: new THREE.Vector3(0.75, 0.85, 1.15), // 青方偏移（R↓G→B↑）
  lift: 0,
};

// snowfield（Phase S5・Piz d'Err）専用の夜グレーディング。元写真が雪面主体で非常に明るいため、
// forest系と同じ-2EVでは雪が単に灰色に沈むだけで「月夜」らしさが出ない。露出低下を弱めに留め、
// 彩度をさらに落として青方偏移を強めることで「青白い月夜」を表現し、lift で岩の陰が
// 黒潰れしないよう底上げする。
export const SNOWFIELD_NIGHT_GRADING: NightGrading = {
  exposure: 0.38,
  saturation: 0.45,
  tint: new THREE.Vector3(0.55, 0.75, 1.4),
  lift: 0.05,
};

/**
 * equirectangular JPGを反転球（内側から見えるよう反転させた球体）に貼り付けて表示する。
 * スポット（campsite / riverside / snowfield）ごとに1インスタンス生成する。
 * MeshBasicMaterialは既にトーンマップ済みの実写JPGをそのまま出す用途のため、
 * レンダラーのACES Filmicトーンマッピングを二重に掛けないよう toneMapped=false にする。
 */
export class PanoScene {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  /**
   * onLoad: 画像デコード完了時に呼ばれる（例: main.ts が scene.environment 用の PMREM を焼くタイミング）。
   * nightGrading: スポットごとに異なる夜の見え方が必要な場合に上書きする（例: 明るい雪山写真は
   * forest系より露出低下を弱め、黒レベルをリフトして黒潰れを防ぐ）。未指定時は forest系の既定値。
   * 値は全て uniform で持たせ、customProgramCacheKey は固定のままにする（GLSLソース自体は
   * スポット間で共通のため、値をリテラルとしてソースへ埋め込んでキーをインスタンスごとに
   * 変える必要はない。むしろ埋め込むとプログラムキャッシュの取り違えが起きる恐れがある）。
   */
  constructor(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    nightGrading: NightGrading = DEFAULT_NIGHT_GRADING
  ) {
    const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS);
    geometry.scale(-1, 1, 1);

    const texture = new THREE.TextureLoader().load(url, onLoad);
    texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false });
    this.material.customProgramCacheKey = () => 'pano-grading';
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.dayness = { value: 1 };
      shader.uniforms.nightTint = { value: nightGrading.tint };
      shader.uniforms.nightExposure = { value: nightGrading.exposure };
      shader.uniforms.nightSaturation = { value: nightGrading.saturation };
      shader.uniforms.nightLift = { value: nightGrading.lift };
      this.material.userData.gradingUniforms = shader.uniforms;

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float dayness;\nuniform vec3 nightTint;\nuniform float nightExposure;\nuniform float nightSaturation;\nuniform float nightLift;'
        )
        .replace(
          '#include <map_fragment>',
          `
#include <map_fragment>
{
  // 露出: 夕(dayness=1)はベース写真のまま、夜(dayness=0)は nightExposure 倍に暗くする
  float exposure = mix(nightExposure, 1.0, dayness);
  vec3 graded = diffuseColor.rgb * exposure;

  // 彩度: 夜は nightSaturation まで落とす
  float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  graded = mix(vec3(luma), graded, mix(nightSaturation, 1.0, dayness));

  // 黒レベルのリフト: 夜だけ底上げし、明暗差の大きい写真の暗部が黒潰れしないようにする
  float floorLevel = mix(nightLift, 0.0, dayness);
  graded = max(graded, vec3(floorLevel));

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
