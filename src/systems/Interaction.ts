import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { GameState } from './GameState';

const INTERACT_RANGE = 15; // ホットスポットは半径8前後に置くため、それより十分大きい安全上限
const INTERACT_KEY = 'KeyE';
const CLICK_MOVE_TOLERANCE = 6; // px。この範囲内の移動ならドラッグ見回しではなく「クリック」と判定する

export interface Interactable {
  object: THREE.Object3D; // raycast 対象（子含む）
  prompt(gs: GameState): string; // 例「Eで木を切る」
  canInteract(gs: GameState): boolean;
  interact(gs: GameState): void;
}

/**
 * マウス位置からのレイキャストで射程内の Interactable を検出し、E キー押下 or クリック時の
 * アクションを仲介する。PointerLock は使わないため、画面中央固定ではなく実際のマウス座標を使う
 * （LookControls のドラッグ見回しと同じ domElement 上のポインターイベントを見るが、
 * pointerdown→pointerup の移動距離が小さいときだけ「クリック」として扱い、見回しドラッグの
 * リリースを誤ってアクション発動させない）。
 * canInteract が false のターゲットへ E/クリックが発生した場合は onBlocked に prompt() の文言を渡す
 * （HUD への配線は main.ts が担う）。
 */
export class Interaction {
  private readonly interactables: Interactable[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly blockedCallbacks: Array<(message: string) => void> = [];
  private readonly pointerNdc = new THREE.Vector2(0, 0);
  private pointerDownPos: { x: number; y: number } | null = null;
  private currentTarget: Interactable | null = null;
  private enabled = true;

  constructor(
    private readonly camera: THREE.Camera,
    input: Input,
    private readonly gs: GameState,
    domElement: HTMLElement
  ) {
    input.onKeyPress(INTERACT_KEY, () => this.handleInteractKey());

    domElement.addEventListener('pointermove', (e) => this.onPointerMove(e, domElement));
    domElement.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    });
    domElement.addEventListener('pointerup', (e) => this.onPointerUp(e));
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

  /** 現在視線が合っている対象（HotspotMarker の setFocused 判定に main.ts が使う）。 */
  get target(): Interactable | null {
    return this.currentTarget;
  }

  /** 座りシーケンスなど、演出中に一時的にレイキャスト判定とE/クリックを無効化する。 */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.currentTarget = null;
    }
  }

  update(): { prompt: string | null } {
    if (!this.enabled) return { prompt: null };

    this.currentTarget = this.findTarget();
    if (this.currentTarget && this.currentTarget.canInteract(this.gs)) {
      return { prompt: this.currentTarget.prompt(this.gs) };
    }
    return { prompt: null };
  }

  private onPointerMove(e: PointerEvent, domElement: HTMLElement): void {
    const rect = domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerUp(e: PointerEvent): void {
    const downPos = this.pointerDownPos;
    this.pointerDownPos = null;
    if (!downPos) return;

    const distance = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (distance <= CLICK_MOVE_TOLERANCE) {
      this.handleInteractKey();
    }
  }

  private findTarget(): Interactable | null {
    // renderer.render() が呼ばれるより前にこの update() が走るため、camera.matrixWorld が
    // 前フレームのまま（見回し中は1フレーム分ずれる）にならないよう明示的に更新する。
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

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
    if (!this.enabled) return;

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
