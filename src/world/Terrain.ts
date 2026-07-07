import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import Alea from 'alea';
import type { Theme } from '../theme/Theme';
import { ForestTheme } from '../theme/ForestTheme';

const RIVER_X = 30;
const RIVER_CARVE_HALF_WIDTH = 6;
const RIVER_CARVE_DEPTH = 2.5;
const RIVER_ZONE_HALF_WIDTH = 4;
const RIVER_SURFACE_WIDTH = 8;
const SEGMENTS = 128;

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
    for (let i = 0; i < position.count; i++) {
      const worldX = position.getX(i);
      const localY = position.getY(i);
      const worldZ = -localY; // rotateX(-PI/2) 後に local Y は -world Z になる
      position.setZ(i, this.heightAt(worldX, worldZ));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.rotateX(-Math.PI / 2);
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({ color: theme.ground.color });
    this.mesh = new THREE.Mesh(geometry, material);

    const riverGeometry = new THREE.PlaneGeometry(RIVER_SURFACE_WIDTH, Terrain.SIZE);
    riverGeometry.rotateX(-Math.PI / 2);
    const riverMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a7a8c,
      transparent: true,
      opacity: 0.8,
    });
    const riverMesh = new THREE.Mesh(riverGeometry, riverMaterial);
    riverMesh.position.set(RIVER_X, Terrain.WATER_LEVEL, 0);
    this.mesh.add(riverMesh);
  }

  heightAt(x: number, z: number): number {
    return terrainHeight(this.noise2D, x, z);
  }

  isInRiver(x: number, _z: number): boolean {
    return Math.abs(x - RIVER_X) < RIVER_ZONE_HALF_WIDTH;
  }
}
