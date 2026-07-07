import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import Alea from 'alea';
import type { Theme } from '../theme/Theme';
import { ForestTheme } from '../theme/ForestTheme';
import { loadPBR } from '../core/textures';

const RIVER_X = 30;
const RIVER_CARVE_HALF_WIDTH = 6;
const RIVER_CARVE_DEPTH = 2.5;
const RIVER_ZONE_HALF_WIDTH = 4;
const SEGMENTS = 128;

// 川岸ブレンド: 水面の縁（|x-30|≈4）からこの距離だけ外側までを「土寄り」として滑らかに薄める。
const BANK_BLEND_OUTER = 12;
const BANK_BLEND_INNER = 4;
const BLEND_NOISE_WEIGHT = 0.35; // 川から離れた場所でも noise で薄く土のパッチを混ぜる強さ
const MACRO_SCALE = 1 / 7; // タイリング対策のマクロバリエーション用の再サンプル縮小率
const MACRO_MIX = 0.4; // マクロバリエーションの適用強度（0=無効、1=全面適用）
// roughnessMap の暗い（低roughness）部分は、太陽やPointLightが浅い角度で当たると強い鏡面
// ハイライトになり、草地に白いキラキラの点々が浮く（grazing-angle specular sparkle）。
// roughness に下限を設けて鏡面反射の鋭さを抑える。
const GROUND_ROUGHNESS_MIN = 0.7;
const GROUND_NORMAL_SCALE = 0.45; // 法線マップの起伏を弱め、キラキラの元になる急峻な法線変化を抑える

type Noise2D = (x: number, y: number) => number;

function terrainHeight(noise2D: Noise2D, x: number, z: number): number {
  // 基本起伏: 2オクターブ
  const base = noise2D(x / 40, z / 40) * 3 + noise2D(x / 12, z / 12) * 0.8;
  // 川筋の掘り下げ: x=30 を中心に幅6m を滑らかに 2.5m 沈める
  const d = Math.abs(x - RIVER_X);
  const t = Math.min(Math.max(1 - d / RIVER_CARVE_HALF_WIDTH, 0), 1); // 0..1
  const carve = RIVER_CARVE_DEPTH * t * t * (3 - 2 * t); // smoothstep
  return base - carve;
}

function smoothstep01(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

/** 草(0)〜土(1)のブレンド係数。川岸に近いほど土寄りになり、遠方でも noise で薄く土のパッチが混ざる。 */
function terrainBlend(noise2D: Noise2D, x: number, z: number): number {
  const d = Math.abs(x - RIVER_X);
  const bankT = 1 - smoothstep01((d - BANK_BLEND_INNER) / (BANK_BLEND_OUTER - BANK_BLEND_INNER));
  const noiseVal = noise2D(x / 15, z / 15) * 0.5 + 0.5; // 0..1
  return Math.min(Math.max(bankT + noiseVal * BLEND_NOISE_WEIGHT, 0), 1);
}

export class Terrain {
  static readonly SIZE = 200;
  static readonly WATER_LEVEL = -1.2;
  static readonly RIVER_X = RIVER_X;

  readonly mesh: THREE.Mesh;
  private readonly noise2D: Noise2D;

  constructor(theme: Theme = ForestTheme) {
    this.noise2D = createNoise2D(Alea('takibi'));

    const geometry = new THREE.PlaneGeometry(Terrain.SIZE, Terrain.SIZE, SEGMENTS, SEGMENTS);
    const position = geometry.attributes.position;
    const blend = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const worldX = position.getX(i);
      const localY = position.getY(i);
      const worldZ = -localY; // rotateX(-PI/2) 後に local Y は -world Z になる
      position.setZ(i, this.heightAt(worldX, worldZ));
      blend[i] = terrainBlend(this.noise2D, worldX, worldZ);
    }
    position.needsUpdate = true;
    geometry.setAttribute('aBlend', new THREE.BufferAttribute(blend, 1));
    geometry.computeVertexNormals();
    geometry.rotateX(-Math.PI / 2);
    geometry.computeBoundingSphere();

    const material = this.buildGroundMaterial(theme);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
  }

  /**
   * theme.ground.textures がある場合、草(primary)と土(secondary)の PBR セットを
   * onBeforeCompile で頂点属性 aBlend によりブレンドする MeshStandardMaterial を構築する。
   * vMapUv は map/normalMap/roughnessMap の repeat が同一（primary 側の transform）なので、
   * secondary 側のサンプリングにもそのまま再利用できる。
   * テクスチャ未設定のテーマ（将来の雪山など）は単色フォールバックのまま。
   */
  private buildGroundMaterial(theme: Theme): THREE.MeshStandardMaterial {
    const textures = theme.ground.textures;
    if (!textures) {
      return new THREE.MeshStandardMaterial({ color: theme.ground.color, metalness: 0 });
    }

    const primary = loadPBR(textures.primary as 'grass' | 'ground' | 'bark' | 'rock', textures.repeat);
    const secondary = loadPBR(textures.secondary as 'grass' | 'ground' | 'bark' | 'rock', textures.repeat);

    const material = new THREE.MeshStandardMaterial({
      map: primary.map,
      normalMap: primary.normalMap,
      normalScale: new THREE.Vector2(GROUND_NORMAL_SCALE, GROUND_NORMAL_SCALE),
      roughnessMap: primary.roughnessMap,
      metalness: 0,
    });
    material.customProgramCacheKey = () => 'terrain-grass-dirt-blend';

    material.onBeforeCompile = (shader) => {
      shader.uniforms.map2 = { value: secondary.map };
      shader.uniforms.normalMap2 = { value: secondary.normalMap };
      shader.uniforms.roughnessMap2 = { value: secondary.roughnessMap };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aBlend;\nvarying float vBlend;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = aBlend;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D map2;\nuniform sampler2D normalMap2;\nuniform sampler2D roughnessMap2;\nvarying float vBlend;'
        )
        .replace(
          '#include <map_fragment>',
          `
#ifdef USE_MAP
  vec4 colorPrimary = texture2D( map, vMapUv );
  vec4 colorSecondary = texture2D( map2, vMapUv );
  vec4 sampledDiffuseColor = mix( colorPrimary, colorSecondary, vBlend );

  // マクロバリエーション: 同じ grass map を低頻度で再サンプルし乗算してタイリングの繰り返し感を抑える
  vec3 macroTint = texture2D( map, vMapUv * ${MACRO_SCALE.toFixed(6)} ).rgb * 2.0;
  sampledDiffuseColor.rgb *= mix( vec3( 1.0 ), macroTint, ${MACRO_MIX.toFixed(2)} );

  diffuseColor *= sampledDiffuseColor;
#endif
`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughnessA = texture2D( roughnessMap, vRoughnessMapUv );
  vec4 texelRoughnessB = texture2D( roughnessMap2, vRoughnessMapUv );
  roughnessFactor *= mix( texelRoughnessA.g, texelRoughnessB.g, vBlend );
#endif
roughnessFactor = max( roughnessFactor, ${GROUND_ROUGHNESS_MIN.toFixed(2)} );
`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `
#ifdef USE_NORMALMAP_OBJECTSPACE
  normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  #ifdef FLIP_SIDED
    normal = - normal;
  #endif
  #ifdef DOUBLE_SIDED
    normal = normal * faceDirection;
  #endif
  normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 mapNA = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  vec3 mapNB = texture2D( normalMap2, vNormalMapUv ).xyz * 2.0 - 1.0;
  vec3 mapN = normalize( mix( mapNA, mapNB, vBlend ) );
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif
`
        );
    };

    return material;
  }

  heightAt(x: number, z: number): number {
    return terrainHeight(this.noise2D, x, z);
  }

  isInRiver(x: number, _z: number): boolean {
    return Math.abs(x - RIVER_X) < RIVER_ZONE_HALF_WIDTH;
  }
}
