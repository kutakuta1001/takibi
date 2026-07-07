import * as THREE from 'three';
import Alea from 'alea';
import { Terrain } from './Terrain';
import { loadPBR, loadWaterNormal } from '../core/textures';

const RIVER_SURFACE_WIDTH = 8;

const RIVERBED_DEPTH_OFFSET = 0.4; // WATER_LEVEL からさらに沈める深さ
const RIVERBED_REPEAT_X = 8;
const RIVERBED_REPEAT_Z = 60;

const WATER_OPACITY = 0.85;
const WATER_ROUGHNESS = 0.1;
const WATER_METALNESS = 0.0;
const WATER_COLOR = 0x3d6b7d;
// 2系統のUVスクロールを合成して水面の流れを表現する（速度・方向をずらして単調な流れを避ける）。
const WATER_SCROLL_SPEED_A = 0.03;
const WATER_SCROLL_SPEED_B = 0.017;
const WATER_SCROLL_ANGLE_B = THREE.MathUtils.degToRad(30);

const ROCK_COUNT = 30;
const ROCK_BANK_INNER = 4; // 川縁からの距離(m)の範囲
const ROCK_BANK_OUTER = 7;
const ROCK_RADIUS = 0.5;
const ROCK_SCALE_MIN = 0.35;
const ROCK_SCALE_MAX = 0.75;
const ROCK_FLATTEN = 0.55; // Y方向を潰して「潰れた岩」にする比率

/**
 * 川の水面・川底・岸辺の岩をまとめて構築する。Terrain 側からは川面の生成を分離しており、
 * Terrain.heightAt / isInRiver / RIVER_X / WATER_LEVEL の公開インターフェースは変更していない。
 */
export class River {
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private time = 0;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.waterMaterial = this.buildWaterMaterial();
    const waterGeometry = new THREE.PlaneGeometry(RIVER_SURFACE_WIDTH, Terrain.SIZE);
    waterGeometry.rotateX(-Math.PI / 2);
    const waterMesh = new THREE.Mesh(waterGeometry, this.waterMaterial);
    waterMesh.position.set(Terrain.RIVER_X, Terrain.WATER_LEVEL, 0);
    scene.add(waterMesh);

    this.buildRiverbed(scene);
    this.buildBankRocks(scene, terrain);
  }

  /** 水面のUVスクロール時間を進める。main.ts の onUpdate から dt を渡して呼ぶ。 */
  update(dt: number): void {
    this.time += dt;
    const uniforms = this.waterMaterial.userData.flowUniforms as { uTime: { value: number } } | undefined;
    if (uniforms) {
      uniforms.uTime.value = this.time;
    }
  }

  private buildWaterMaterial(): THREE.MeshStandardMaterial {
    const waterNormal = loadWaterNormal();
    waterNormal.wrapS = THREE.RepeatWrapping;
    waterNormal.wrapT = THREE.RepeatWrapping;

    const material = new THREE.MeshStandardMaterial({
      color: WATER_COLOR,
      normalMap: waterNormal,
      transparent: true,
      opacity: WATER_OPACITY,
      roughness: WATER_ROUGHNESS,
      metalness: WATER_METALNESS,
    });
    material.customProgramCacheKey = () => 'river-flowing-water';

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      material.userData.flowUniforms = shader.uniforms;

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
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
  vec2 flowDirB = vec2( cos( ${WATER_SCROLL_ANGLE_B.toFixed(6)} ), sin( ${WATER_SCROLL_ANGLE_B.toFixed(6)} ) );
  vec2 flowUvA = vNormalMapUv + vec2( 0.0, 1.0 ) * uTime * ${WATER_SCROLL_SPEED_A.toFixed(4)};
  vec2 flowUvB = vNormalMapUv + flowDirB * uTime * ${WATER_SCROLL_SPEED_B.toFixed(4)};

  vec3 mapNA = texture2D( normalMap, flowUvA ).xyz * 2.0 - 1.0;
  vec3 mapNB = texture2D( normalMap, flowUvB ).xyz * 2.0 - 1.0;
  vec3 mapN = normalize( mapNA + mapNB );
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

  /** 水面の下に rock テクスチャの帯メッシュを敷いて、透けたときに川底が見えるようにする。 */
  private buildRiverbed(scene: THREE.Scene): void {
    const rock = loadPBR('rock', RIVERBED_REPEAT_X);
    rock.map.repeat.set(RIVERBED_REPEAT_X, RIVERBED_REPEAT_Z);
    rock.normalMap.repeat.set(RIVERBED_REPEAT_X, RIVERBED_REPEAT_Z);
    rock.roughnessMap?.repeat.set(RIVERBED_REPEAT_X, RIVERBED_REPEAT_Z);

    const material = new THREE.MeshStandardMaterial({
      map: rock.map,
      normalMap: rock.normalMap,
      roughnessMap: rock.roughnessMap,
      metalness: 0,
    });

    const geometry = new THREE.PlaneGeometry(RIVER_SURFACE_WIDTH, Terrain.SIZE);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(Terrain.RIVER_X, Terrain.WATER_LEVEL - RIVERBED_DEPTH_OFFSET, 0);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  /** 川縁（|x-RIVER_X| が4〜7m）に潰した岩を30個 seed 配置し、直線的な川岸の見えを崩す。 */
  private buildBankRocks(scene: THREE.Scene, terrain: Terrain): void {
    const rock = loadPBR('rock', 1);
    const material = new THREE.MeshStandardMaterial({
      map: rock.map,
      normalMap: rock.normalMap,
      roughnessMap: rock.roughnessMap,
      metalness: 0,
    });
    const geometry = new THREE.IcosahedronGeometry(ROCK_RADIUS, 1);

    const mesh = new THREE.InstancedMesh(geometry, material, ROCK_COUNT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const rand = Alea('takibi-rocks');
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();

    for (let i = 0; i < ROCK_COUNT; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const distance = ROCK_BANK_INNER + rand() * (ROCK_BANK_OUTER - ROCK_BANK_INNER);
      const x = Terrain.RIVER_X + side * distance;
      const z = (rand() - 0.5) * Terrain.SIZE;
      const groundY = terrain.heightAt(x, z);

      const scale = ROCK_SCALE_MIN + rand() * (ROCK_SCALE_MAX - ROCK_SCALE_MIN);
      scaleVec.set(scale, scale * ROCK_FLATTEN, scale);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      // 潰した高さの一部だけ埋めて、地面から生えているように見せる
      position.set(x, groundY + scale * ROCK_RADIUS * ROCK_FLATTEN * 0.6, z);

      matrix.compose(position, quaternion, scaleVec);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    scene.add(mesh);
  }
}
