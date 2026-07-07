import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { playChop, playTreeFall } from '../audio/synths';
import { Hotspot, type HotspotDirection } from '../pano/Hotspot';
import type { GameState } from '../systems/GameState';

const CHOPPABLE_HITS = 4;
const LOGS_AWARDED = 3;

const AXE_SWING_DURATION = 0.3; // seconds
const AXE_SWING_ANGLE = (50 * Math.PI) / 180;
const AXE_REST_ROTATION_X = 0.3;
// v1 は距離0.55・スケール1のまま（カメラがsceneに未登録で描画されておらず見た目未検証だった）。
// 実際に描画されると画面の大半を占める大きさだったため、遠ざけて縮小し、
// 画面右下の隅にちらっと見える控えめなビューモデルに調整した。
const AXE_DISTANCE = 1.4;
const AXE_SCALE = 0.55;

/**
 * campsite パノラマ内の実際の木の方向に置いた伐採ホットスポット（v1 systems/Chopping.ts から移植）。
 * 写真の木自体は動かせないため倒木アニメは実装せず、E/クリック4回で伐倒音を鳴らし薪+3を加算する
 * ところまでを表現する。画面右下の斧ビューモデルと振りアニメはv1のまま移植。
 * hotspot を Interaction へ登録/解除するのは main.ts（campsite にいる間だけ有効にするため）。
 */
export class Chopping {
  readonly hotspot: Hotspot;

  private readonly axeGroup: THREE.Group;
  private axeSwingElapsed: number | null = null;
  private hitsRemaining = CHOPPABLE_HITS;
  private felled = false;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    private readonly audio: AudioEngine,
    private readonly gs: GameState,
    direction: HotspotDirection,
    angularRadius: number
  ) {
    this.hotspot = new Hotspot(direction, angularRadius, {
      prompt: () => (this.felled ? '' : `Eで木を切る（あと${this.hitsRemaining}回）`),
      canInteract: () => !this.felled,
      interact: () => this.onChop(),
    });
    // レイキャスト対象の matrixWorld を更新させるため、非表示でもシーングラフに加える必要がある
    // （scene に入れないと matrixWorld が単位行列のままでレイが絶対に当たらない）。
    scene.add(this.hotspot.object);

    this.axeGroup = this.buildAxeViewModel();
    camera.add(this.axeGroup);
  }

  /** 斧ビューモデルの表示/非表示（campsite にいる間だけ表示する。main.ts がスポット切替で呼ぶ）。 */
  setVisible(visible: boolean): void {
    this.axeGroup.visible = visible;
  }

  update(dt: number): void {
    this.updateAxeSwing(dt);
  }

  private onChop(): void {
    playChop(this.audio.ctx, this.audio.master);
    this.axeSwingElapsed = 0;
    this.hitsRemaining -= 1;

    if (this.hitsRemaining <= 0) {
      this.felled = true;
      playTreeFall(this.audio.ctx, this.audio.master);
      this.gs.addLogs(LOGS_AWARDED);
    }
  }

  /** 画面右下に固定表示する簡易な斧ビューモデル（Box=柄 + Cylinder=刃）。カメラの子として追従させる。 */
  private buildAxeViewModel(): THREE.Group {
    const group = new THREE.Group();

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.5, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x3d2b1a, roughness: 0.9, metalness: 0 })
    );
    handle.position.y = 0.25;
    group.add(handle);

    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0x5c5c60, roughness: 0.75, metalness: 0.55 })
    );
    head.rotation.x = Math.PI / 2;
    head.position.y = 0.5;
    group.add(head);

    // 元の (0.35, -0.35, -0.55) と同じ画面上の隅（NDC）を保ったまま AXE_DISTANCE まで遠ざける。
    const anchorRatio = 0.35 / 0.55;
    group.position.set(anchorRatio * AXE_DISTANCE, -anchorRatio * AXE_DISTANCE, -AXE_DISTANCE);
    group.scale.setScalar(AXE_SCALE);
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
