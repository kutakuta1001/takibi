import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Alea from 'alea';
import type { Theme } from '../theme/Theme';
import type { Terrain } from './Terrain';

const TRUNK_RADIUS_TOP = 0.25;
const TRUNK_RADIUS_BOTTOM = 0.4;
const TRUNK_HEIGHT = 3;
const LEAF_RADIUS = 1.6;
const LEAF_HEIGHT = 4;
const LEAF_SEGMENTS = 8;
const LEAF_TRUNK_OVERLAP = 0.4; // 下段の葉が幹に少し被る量
const LEAF_TIER_GAP = 0.55; // 上段の葉を下段からどれだけ持ち上げるか（下段高さ比）

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

function buildTreeMaterials(theme: Theme): TreeMaterials {
  return {
    trunk: new THREE.MeshStandardMaterial({ color: theme.trees.trunkColor }),
    leaf: new THREE.MeshStandardMaterial({ color: theme.trees.leafColor }),
  };
}

/** 伐採可能な木を個別 Group として構築する（倒木アニメのため InstancedMesh にしない）。 */
function buildTreeGroup(materials: TreeMaterials): THREE.Group {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(TRUNK_RADIUS_TOP, TRUNK_RADIUS_BOTTOM, TRUNK_HEIGHT),
    materials.trunk
  );
  trunk.position.y = TRUNK_HEIGHT / 2;
  group.add(trunk);

  const leaves = new THREE.Mesh(buildLayeredLeafGeometry(), materials.leaf);
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

    const trunkGeometry = new THREE.CylinderGeometry(TRUNK_RADIUS_TOP, TRUNK_RADIUS_BOTTOM, TRUNK_HEIGHT);
    trunkGeometry.translate(0, TRUNK_HEIGHT / 2, 0);
    const leafGeometry = buildLayeredLeafGeometry();

    const count = theme.trees.count;
    const trunkMesh = new THREE.InstancedMesh(trunkGeometry, materials.trunk, count);
    const leafMesh = new THREE.InstancedMesh(leafGeometry, materials.leaf, count);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);

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
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;

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
