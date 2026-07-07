import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise2D } from 'simplex-noise';
import Alea from 'alea';
import type { Theme } from '../theme/Theme';
import type { Terrain } from './Terrain';
import { loadPBR } from '../core/textures';

const TRUNK_RADIUS_TOP = 0.25;
const TRUNK_RADIUS_BOTTOM = 0.4;
const TRUNK_HEIGHT = 3;
const TRUNK_RADIAL_SEGMENTS = 12;
const TRUNK_HEIGHT_SEGMENTS = 4;
const TRUNK_NOISE_FREQ = 2.5; // 幹一周あたりの起伏の細かさ
const TRUNK_NOISE_HEIGHT_FREQ = 0.6; // 高さ方向の起伏の細かさ
const TRUNK_NOISE_AMOUNT = 0.12; // 半径に対するノイズ変位の強さ（円柱感を消す）
const TRUNK_BARK_REPEAT_Y = 2; // 幹に沿った縦方向のタイル数
const LEAF_RADIUS = 1.6;
const LEAF_HEIGHT = 4;
const LEAF_SEGMENTS = 8;
const LEAF_TRUNK_OVERLAP = 0.4; // 下段の葉が幹に少し被る量
const LEAF_TIER_GAP = 0.55; // 上段の葉を下段からどれだけ持ち上げるか（下段高さ比）
const LEAF_COLOR_VARIATION = 0.2; // per-instance の色ばらつき（±10%）

const CAMP_EXCLUSION_RADIUS = 12;
const POSITION_ATTEMPTS = 30;

const CHOPPABLE_COUNT = 6;
const CHOPPABLE_MIN_RADIUS = 14;
const CHOPPABLE_MAX_RADIUS = 20;
const CHOPPABLE_HITS = 4;

const SCALE_MIN = 0.8;
const SCALE_MAX = 1.2;

interface TreeMaterials {
  trunk: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
}

export class ChoppableTree {
  hitsRemaining = CHOPPABLE_HITS;

  constructor(
    readonly object: THREE.Group,
    readonly position: THREE.Vector3
  ) {}

  chop(): 'hit' | 'felled' {
    this.hitsRemaining -= 1;
    return this.hitsRemaining <= 0 ? 'felled' : 'hit';
  }
}

function isFreeOfExclusionZones(x: number, z: number, terrain: Terrain): boolean {
  if (terrain.isInRiver(x, z)) return false;
  if (Math.hypot(x, z) < CAMP_EXCLUSION_RADIUS) return false;
  return true;
}

/** 幹の上に2段重ねた葉のジオメトリを1つの BufferGeometry に統合する（InstancedMesh を1本/木に保つため）。 */
function buildLayeredLeafGeometry(): THREE.BufferGeometry {
  const lowerY = TRUNK_HEIGHT - LEAF_TRUNK_OVERLAP + LEAF_HEIGHT / 2;
  const upperY = lowerY + LEAF_HEIGHT * LEAF_TIER_GAP;

  const lower = new THREE.ConeGeometry(LEAF_RADIUS, LEAF_HEIGHT, LEAF_SEGMENTS);
  lower.translate(0, lowerY, 0);
  const upper = new THREE.ConeGeometry(LEAF_RADIUS, LEAF_HEIGHT, LEAF_SEGMENTS);
  upper.translate(0, upperY, 0);

  return mergeGeometries([lower, upper]);
}

/**
 * 幹ジオメトリを径方向ノイズでわずかに歪ませ、完全な円柱のシルエットを消す
 * （bark 写真テクスチャと組み合わせて樹皮の凹凸感を出す）。cos/sin 経由で角度をサンプルするため
 * 0/2π のシームは生じない。translateUp=true なら InstancedMesh 用に高さ方向を先に平行移動する。
 */
function buildTrunkGeometry(translateUp: boolean): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(
    TRUNK_RADIUS_TOP,
    TRUNK_RADIUS_BOTTOM,
    TRUNK_HEIGHT,
    TRUNK_RADIAL_SEGMENTS,
    TRUNK_HEIGHT_SEGMENTS
  );

  const noise2D = createNoise2D(Alea('takibi-trunk-bark'));
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius < 1e-4) continue; // 上下キャップの中心点は歪ませない

    const angle = Math.atan2(z, x);
    const cx = Math.cos(angle) * TRUNK_NOISE_FREQ;
    const cz = Math.sin(angle) * TRUNK_NOISE_FREQ;
    const noiseVal = noise2D(cx + y * TRUNK_NOISE_HEIGHT_FREQ, cz);
    const scale = 1 + noiseVal * TRUNK_NOISE_AMOUNT;
    position.setX(i, x * scale);
    position.setZ(i, z * scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  if (translateUp) {
    geometry.translate(0, TRUNK_HEIGHT / 2, 0);
  }
  return geometry;
}

function buildTreeMaterials(theme: Theme): TreeMaterials {
  const bark = loadPBR('bark', 1);
  bark.map.repeat.set(1, TRUNK_BARK_REPEAT_Y);
  bark.normalMap.repeat.set(1, TRUNK_BARK_REPEAT_Y);
  bark.roughnessMap?.repeat.set(1, TRUNK_BARK_REPEAT_Y);

  return {
    trunk: new THREE.MeshStandardMaterial({
      map: bark.map,
      normalMap: bark.normalMap,
      roughnessMap: bark.roughnessMap,
      metalness: 0,
    }),
    leaf: new THREE.MeshStandardMaterial({ color: theme.trees.leafColor, roughness: 0.9, metalness: 0 }),
  };
}

/** 伐採可能な木を個別 Group として構築する（倒木アニメのため InstancedMesh にしない）。 */
function buildTreeGroup(materials: TreeMaterials): THREE.Group {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(buildTrunkGeometry(false), materials.trunk);
  trunk.position.y = TRUNK_HEIGHT / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const leaves = new THREE.Mesh(buildLayeredLeafGeometry(), materials.leaf);
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  group.add(leaves);

  return group;
}

export class Forest {
  readonly group: THREE.Group;
  readonly choppableTrees: ChoppableTree[] = [];

  constructor(theme: Theme, terrain: Terrain) {
    this.group = new THREE.Group();
    const materials = buildTreeMaterials(theme);

    this.group.add(this.buildBackgroundTrees(theme, terrain, materials));
    this.buildChoppableTrees(terrain, materials);
  }

  private buildBackgroundTrees(theme: Theme, terrain: Terrain, materials: TreeMaterials): THREE.Group {
    const group = new THREE.Group();
    const rand = Alea('takibi-forest');

    const trunkGeometry = buildTrunkGeometry(true);
    const leafGeometry = buildLayeredLeafGeometry();

    const count = theme.trees.count;
    const trunkMesh = new THREE.InstancedMesh(trunkGeometry, materials.trunk, count);
    const leafMesh = new THREE.InstancedMesh(leafGeometry, materials.leaf, count);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const leafBaseColor = new THREE.Color(theme.trees.leafColor);
    const leafColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      let attempts = 0;
      do {
        const angle = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * theme.trees.radius;
        x = Math.cos(angle) * r;
        z = Math.sin(angle) * r;
        attempts++;
      } while (!isFreeOfExclusionZones(x, z, terrain) && attempts < POSITION_ATTEMPTS);

      const y = terrain.heightAt(x, z);
      const scale = SCALE_MIN + rand() * (SCALE_MAX - SCALE_MIN);
      quaternion.setFromAxisAngle(upAxis, rand() * Math.PI * 2);
      scaleVec.set(scale, scale, scale);
      position.set(x, y, z);

      matrix.compose(position, quaternion, scaleVec);
      trunkMesh.setMatrixAt(i, matrix);
      leafMesh.setMatrixAt(i, matrix);

      // 葉の色を per-instance で ±10% ばらつかせ、森全体の色が単調にならないようにする
      const variation = 1 + (rand() - 0.5) * LEAF_COLOR_VARIATION;
      leafColor.copy(leafBaseColor).multiplyScalar(variation);
      leafMesh.setColorAt(i, leafColor);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    if (leafMesh.instanceColor) {
      leafMesh.instanceColor.needsUpdate = true;
    }

    trunkMesh.castShadow = true;
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;

    group.add(trunkMesh, leafMesh);
    return group;
  }

  private buildChoppableTrees(terrain: Terrain, materials: TreeMaterials): void {
    const rand = Alea('takibi-forest-choppable');

    for (let i = 0; i < CHOPPABLE_COUNT; i++) {
      const angle = (i / CHOPPABLE_COUNT) * Math.PI * 2 + rand() * 0.3;
      const radius = CHOPPABLE_MIN_RADIUS + rand() * (CHOPPABLE_MAX_RADIUS - CHOPPABLE_MIN_RADIUS);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = terrain.heightAt(x, z);

      const object = buildTreeGroup(materials);
      object.position.set(x, y, z);
      object.rotation.y = rand() * Math.PI * 2;
      this.group.add(object);

      this.choppableTrees.push(new ChoppableTree(object, new THREE.Vector3(x, y, z)));
    }
  }
}
