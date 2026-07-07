import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { GameState } from './GameState';

const INTERACT_RANGE = 3;
const INTERACT_KEY = 'KeyE';
const CENTER_NDC = new THREE.Vector2(0, 0);

export interface Interactable {
  object: THREE.Object3D; // raycast 対象（子含む）
  prompt(gs: GameState): string; // 例「Eで木を切る」
  canInteract(gs: GameState): boolean;
  interact(gs: GameState): void;
}

/**
 * 画面中央からのレイキャストで射程内の Interactable を検出し、E キー押下時のアクションを仲介する。
 * canInteract が false のターゲットへ E が押された場合は onBlocked に prompt() の文言を渡す
 * （HUD への配線は main.ts が担う）。
 */
export class Interaction {
  private readonly interactables: Interactable[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly blockedCallbacks: Array<(message: string) => void> = [];
  private currentTarget: Interactable | null = null;

  constructor(
    private readonly camera: THREE.Camera,
    input: Input,
    private readonly gs: GameState
  ) {
    input.onKeyPress(INTERACT_KEY, () => this.handleInteractKey());
  }

  add(i: Interactable): void {
    this.interactables.push(i);
  }

  remove(i: Interactable): void {
    const index = this.interactables.indexOf(i);
    if (index !== -1) {
      this.interactables.splice(index, 1);
    }
  }

  onBlocked(cb: (message: string) => void): void {
    this.blockedCallbacks.push(cb);
  }

  update(): { prompt: string | null } {
    this.currentTarget = this.findTarget();
    if (this.currentTarget && this.currentTarget.canInteract(this.gs)) {
      return { prompt: this.currentTarget.prompt(this.gs) };
    }
    return { prompt: null };
  }

  private findTarget(): Interactable | null {
    this.raycaster.setFromCamera(CENTER_NDC, this.camera);

    let closest: Interactable | null = null;
    let closestDistance = Infinity;
    for (const interactable of this.interactables) {
      const hits = this.raycaster.intersectObject(interactable.object, true);
      if (hits.length === 0) continue;
      const distance = hits[0].distance;
      if (distance > INTERACT_RANGE || distance >= closestDistance) continue;
      closest = interactable;
      closestDistance = distance;
    }
    return closest;
  }

  private handleInteractKey(): void {
    const target = this.currentTarget;
    if (!target) return;

    if (target.canInteract(this.gs)) {
      target.interact(this.gs);
    } else {
      const message = target.prompt(this.gs);
      for (const cb of this.blockedCallbacks) cb(message);
    }
  }
}
