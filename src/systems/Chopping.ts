import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { playChop, playTreeFall, playPickup } from '../audio/synths';
import type { ChoppableTree, Forest } from '../world/Forest';
import type { GameState } from './GameState';
import type { Interactable, Interaction } from './Interaction';

const FALL_DURATION = 1.2; // seconds
const FALL_ANGLE = Math.PI / 2; // 90度

const LOG_COUNT = 3;
const LOG_RADIUS = 0.12;
const LOG_LENGTH = 0.8;
const LOG_SCATTER_RADIUS = 1.3;
const LOG_COLOR = 0x5b4633;

const AXE_SWING_DURATION = 0.3; // seconds
const AXE_SWING_ANGLE = (50 * Math.PI) / 180;
const AXE_REST_ROTATION_X = 0.3;

export class TreeInteractable implements Interactable {
  readonly object: THREE.Object3D;

  constructor(
    private readonly tree: ChoppableTree,
    private readonly onChop: () => void,
    private readonly onFelled: () => void
  ) {
    this.object = tree.object;
  }

  prompt(): string {
    return `Eで木を切る（あと${this.tree.hitsRemaining}回）`;
  }

  canInteract(): boolean {
    return this.tree.hitsRemaining > 0;
  }

  interact(): void {
    this.onChop();
    if (this.tree.chop() === 'felled') {
      this.onFelled();
    }
  }
}

export class LogPickup implements Interactable {
  constructor(
    readonly object: THREE.Object3D,
    private readonly onPickup: () => void
  ) {}

  prompt(): string {
    return 'Eで薪を拾う';
  }

  canInteract(): boolean {
    return true;
  }

  interact(gs: GameState): void {
    gs.addLogs(1);
    this.onPickup();
  }
}

interface FellingTree {
  group: THREE.Group;
  elapsed: number;
  fromQuaternion: THREE.Quaternion;
  toQuaternion: THREE.Quaternion;
  basePosition: THREE.Vector3;
}

/**
 * 木の伐採（chop → 伐倒アニメ → 薪3本スポーン → 拾って GameState に加算）と、
 * 画面右下の斧ビューモデル・振りアニメを担う。
 */
export class Chopping {
  private readonly fellingTrees: FellingTree[] = [];
  private readonly axeGroup: THREE.Group;
  private axeSwingElapsed: number | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    camera: THREE.Camera,
    forest: Forest,
    private readonly audio: AudioEngine,
    private readonly interaction: Interaction
  ) {
    for (const tree of forest.choppableTrees) {
      this.registerTree(tree);
    }

    this.axeGroup = this.buildAxeViewModel();
    camera.add(this.axeGroup);
  }

  update(dt: number): void {
    this.updateFellingTrees(dt);
    this.updateAxeSwing(dt);
  }

  private registerTree(tree: ChoppableTree): void {
    const treeInteractable: TreeInteractable = new TreeInteractable(
      tree,
      () => this.onChopHit(),
      () => this.onTreeFelled(tree, treeInteractable)
    );
    this.interaction.add(treeInteractable);
  }

  private onChopHit(): void {
    playChop(this.audio.ctx, this.audio.master);
    this.axeSwingElapsed = 0;
  }

  private onTreeFelled(tree: ChoppableTree, treeInteractable: TreeInteractable): void {
    this.interaction.remove(treeInteractable);
    playTreeFall(this.audio.ctx, this.audio.master);

    const angle = Math.random() * Math.PI * 2;
    const axis = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle)).normalize();
    const fromQuaternion = tree.object.quaternion.clone();
    const toQuaternion = fromQuaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, FALL_ANGLE));

    this.fellingTrees.push({
      group: tree.object,
      elapsed: 0,
      fromQuaternion,
      toQuaternion,
      basePosition: tree.position.clone(),
    });
  }

  private updateFellingTrees(dt: number): void {
    for (let i = this.fellingTrees.length - 1; i >= 0; i--) {
      const felling = this.fellingTrees[i];
      felling.elapsed += dt;
      const t = Math.min(felling.elapsed / FALL_DURATION, 1);
      felling.group.quaternion.slerpQuaternions(felling.fromQuaternion, felling.toQuaternion, t);

      if (t >= 1) {
        this.fellingTrees.splice(i, 1);
        this.spawnLogs(felling.basePosition);
      }
    }
  }

  private spawnLogs(basePosition: THREE.Vector3): void {
    for (let i = 0; i < LOG_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * LOG_SCATTER_RADIUS;
      const x = basePosition.x + Math.cos(angle) * distance;
      const z = basePosition.z + Math.sin(angle) * distance;

      const geometry = new THREE.CylinderGeometry(LOG_RADIUS, LOG_RADIUS, LOG_LENGTH, 8);
      const material = new THREE.MeshStandardMaterial({ color: LOG_COLOR });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.z = Math.PI / 2;
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.position.set(x, basePosition.y + LOG_RADIUS, z);
      this.scene.add(mesh);

      const pickup: LogPickup = new LogPickup(mesh, () => {
        playPickup(this.audio.ctx, this.audio.master);
        this.interaction.remove(pickup);
        this.scene.remove(mesh);
        geometry.dispose();
        material.dispose();
      });
      this.interaction.add(pickup);
    }
  }

  /** 画面右下に固定表示する簡易な斧ビューモデル（Box=柄 + Cylinder=刃）。カメラの子として追従させる。 */
  private buildAxeViewModel(): THREE.Group {
    const group = new THREE.Group();

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.5, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x5b4633 })
    );
    handle.position.y = 0.25;
    group.add(handle);

    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0x9a9a9a })
    );
    head.rotation.x = Math.PI / 2;
    head.position.y = 0.5;
    group.add(head);

    group.position.set(0.35, -0.35, -0.55);
    group.rotation.set(AXE_REST_ROTATION_X, 0.5, 0.1);
    return group;
  }

  private updateAxeSwing(dt: number): void {
    if (this.axeSwingElapsed === null) return;

    this.axeSwingElapsed += dt;
    const t = Math.min(this.axeSwingElapsed / AXE_SWING_DURATION, 1);
    const swing = Math.sin(t * Math.PI); // 0 -> 1 -> 0 で振り下ろして戻す
    this.axeGroup.rotation.x = AXE_REST_ROTATION_X - swing * AXE_SWING_ANGLE;

    if (t >= 1) {
      this.axeSwingElapsed = null;
      this.axeGroup.rotation.x = AXE_REST_ROTATION_X;
    }
  }
}
