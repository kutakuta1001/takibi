import * as THREE from 'three';
import type { GameState } from '../systems/GameState';
import type { Interactable } from '../systems/Interaction';

const HOTSPOT_DISTANCE = 8; // パノラマ球（半径50）の内側、レイキャストに十分な距離

export interface HotspotDirection {
  yaw: number;
  pitch: number;
}

export interface HotspotHandlers {
  prompt: (gs: GameState) => string;
  canInteract: (gs: GameState) => boolean;
  interact: (gs: GameState) => void;
}

/**
 * パノラマ空間内の方向（yaw/pitch）に置いた不可視の当たり球。Interactable として振る舞う。
 * 方向→座標の変換は LookControls.applyRotation と同じ camera.rotation.set(pitch, yaw, 0, 'YXZ')
 * 規約に合わせる（forward = (-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch))）。
 */
export class Hotspot implements Interactable {
  readonly object: THREE.Object3D;

  constructor(
    direction: HotspotDirection,
    angularRadius: number,
    private readonly handlers: HotspotHandlers
  ) {
    const x = -Math.sin(direction.yaw) * Math.cos(direction.pitch);
    const y = Math.sin(direction.pitch);
    const z = -Math.cos(direction.yaw) * Math.cos(direction.pitch);

    const radius = HOTSPOT_DISTANCE * Math.tan(angularRadius);
    const geometry = new THREE.SphereGeometry(radius, 12, 8);
    const material = new THREE.MeshBasicMaterial({ visible: false });
    this.object = new THREE.Mesh(geometry, material);
    this.object.position.set(x * HOTSPOT_DISTANCE, y * HOTSPOT_DISTANCE, z * HOTSPOT_DISTANCE);
  }

  prompt(gs: GameState): string {
    return this.handlers.prompt(gs);
  }

  canInteract(gs: GameState): boolean {
    return this.handlers.canInteract(gs);
  }

  interact(gs: GameState): void {
    this.handlers.interact(gs);
  }
}
