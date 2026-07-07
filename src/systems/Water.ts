import * as THREE from 'three';
import { Terrain } from '../world/Terrain';
import { playWaterFill } from '../audio/synths';
import type { AudioEngine } from '../audio/AudioEngine';
import type { GameState } from './GameState';
import type { Interactable } from './Interaction';

// 川面（Terrain の riverMesh）と同じ幅・川筋全長をカバーする見えないヒットボックス。
const ZONE_WIDTH = 8;
const ZONE_HEIGHT = 6;
const ZONE_DEPTH = Terrain.SIZE;

/** 川辺の見えないヒットボックス。射程3mのレイキャストで「Eで水を汲む」。kettle が 'empty' 以外なら不可。 */
export class WaterZone implements Interactable {
  readonly object: THREE.Object3D;

  constructor(
    scene: THREE.Scene,
    private readonly audio: AudioEngine
  ) {
    const geometry = new THREE.BoxGeometry(ZONE_WIDTH, ZONE_HEIGHT, ZONE_DEPTH);
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const box = new THREE.Mesh(geometry, material);
    box.position.set(Terrain.RIVER_X, Terrain.WATER_LEVEL + ZONE_HEIGHT / 2 - 1, 0);
    scene.add(box);
    this.object = box;
  }

  prompt(): string {
    return 'Eで水を汲む';
  }

  canInteract(gs: GameState): boolean {
    return gs.kettle === 'empty';
  }

  interact(gs: GameState): void {
    if (gs.fillKettle()) {
      playWaterFill(this.audio.ctx, this.audio.master);
    }
  }
}
