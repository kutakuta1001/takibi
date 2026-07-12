import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { playChop, playTreeFall } from '../audio/synths';
import type { GameState } from '../systems/GameState';

const CHOPPABLE_HITS = 4;
const LOGS_AWARDED = 3;

const AXE_SWING_DURATION = 0.3; // seconds
const AXE_SWING_ANGLE = (50 * Math.PI) / 180;
const AXE_REST_ROTATION_X = 0.3;
const FELL_SWING_INTERVAL = 0.9; // 自動伐採の一振りの間隔（秒）
// v1 は距離0.55・スケール1のまま（カメラがsceneに未登録で描画されておらず見た目未検証だった）。
// 実際に描画されると画面の大半を占める大きさだったため、遠ざけて縮小し、
// 画面右下の隅にちらっと見える控えめなビューモデルに調整した。
const AXE_DISTANCE = 1.4;
const AXE_SCALE = 0.55;

// 柄: 頭側が細く握り側が太いわずかなテーパー（実際の斧の柄の形に近づける）。
const HANDLE_LENGTH = 0.5;
const HANDLE_RADIUS_TOP = 0.016;
const HANDLE_RADIUS_BOTTOM = 0.026;
const HANDLE_COLOR = 0x4a3320;
// グリップ: 握る側だけ色を変えた短い円柱を重ねて巻き革のような質感差を出す。
const GRIP_LENGTH = 0.14;
const GRIP_COLOR = 0x1c140d;
// 頭部: 柄の上端から横へ突き出す薄い楔（金属質）。四角錐(ConeGeometry, radialSegments=4)を
// 横向きに倒して薄く潰すことで、丸い槌ではなく刃のある楔形に見せる。
const HEAD_REACH = 0.22; // 柄からの突き出し長さ（刃先までの距離）
const HEAD_WIDTH = 0.16; // 刃の上下方向の幅
const HEAD_THICKNESS = 0.045; // 刃の厚み
const HEAD_COLOR = 0x6b6f76;
const HEAD_ROUGHNESS = 0.4;
const HEAD_METALNESS = 0.8;

/**
 * 選択肢「木を切る」で自動的に4回振って伐倒音を鳴らし薪+3を加算する（v1 systems/Chopping.ts から移植）。
 * 写真の木自体は動かせないため倒木アニメは実装しない。画面右下の斧ビューモデルと振りアニメはv1のまま移植。
 */
export class Chopping {
  private readonly axeGroup: THREE.Group;
  private axeSwingElapsed: number | null = null;
  private hitsRemaining = CHOPPABLE_HITS;
  private treeFelled = false;
  private fellSequence: { timer: number; resolve: () => void } | null = null;

  get felled(): boolean {
    return this.treeFelled;
  }

  constructor(
    camera: THREE.Camera,
    private readonly audio: AudioEngine,
    private readonly gs: GameState
  ) {
    this.axeGroup = this.buildAxeViewModel();
    camera.add(this.axeGroup);
  }

  /** 斧ビューモデルの表示/非表示（campsite にいる間だけ表示する。main.ts がスポット切替で呼ぶ）。 */
  setVisible(visible: boolean): void {
    this.axeGroup.visible = visible;
  }

  update(dt: number): void {
    this.updateAxeSwing(dt);
    this.updateFellSequence(dt);
  }

  /** 選択肢「木を切る」の自動演出。一定間隔で残り回数ぶん振り、伐倒音と薪加算（既存 onChop）まで進める。 */
  fell(): Promise<void> {
    if (this.treeFelled || this.fellSequence) return Promise.resolve();
    return new Promise((resolve) => {
      this.fellSequence = { timer: 0, resolve };
    });
  }

  private onChop(): void {
    playChop(this.audio.ctx, this.audio.master);
    this.axeSwingElapsed = 0;
    this.hitsRemaining -= 1;

    if (this.hitsRemaining <= 0) {
      this.treeFelled = true;
      playTreeFall(this.audio.ctx, this.audio.master);
      this.gs.addLogs(LOGS_AWARDED);
    }
  }

  private updateFellSequence(dt: number): void {
    const seq = this.fellSequence;
    if (!seq) return;
    seq.timer -= dt;
    if (seq.timer > 0) return;
    seq.timer = FELL_SWING_INTERVAL;
    this.onChop(); // 一振り（音 + スイング + 残数減。最後の一振りで伐倒音 + 薪加算まで既存ロジックが走る）
    if (this.treeFelled) {
      this.fellSequence = null;
      seq.resolve();
    }
  }

  /**
   * 画面右下に固定表示する簡易な斧ビューモデル。柄はテーパー付き円柱+握り側の色変化、
   * 頭部は金属質(metalness/roughness)の薄い楔（四角錐を横向きに倒して潰した形）にし、
   * 「白い棒」に見えない、丸い槌ではなく刃のある斧に見えることを狙う。カメラの子として追従させる。
   */
  private buildAxeViewModel(): THREE.Group {
    const group = new THREE.Group();

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(HANDLE_RADIUS_TOP, HANDLE_RADIUS_BOTTOM, HANDLE_LENGTH, 8),
      new THREE.MeshStandardMaterial({ color: HANDLE_COLOR, roughness: 0.85, metalness: 0 })
    );
    handle.position.y = HANDLE_LENGTH / 2;
    group.add(handle);

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(HANDLE_RADIUS_BOTTOM * 1.05, HANDLE_RADIUS_BOTTOM * 1.05, GRIP_LENGTH, 8),
      new THREE.MeshStandardMaterial({ color: GRIP_COLOR, roughness: 0.95, metalness: 0 })
    );
    grip.position.y = GRIP_LENGTH / 2;
    group.add(grip);

    // ConeGeometry(半径, 高さ, 4面) はデフォルトで頂点が+Y・底面(四角)が-Y側にある。
    // Z軸回りに-90度回して頂点を+X（柄から外側へ突き出す方向）へ向け、Z方向に薄く潰し、
    // 底面(=柄との接合部)がX=0に来るよう平行移動して柄の上端に据える。
    const headGeometry = new THREE.ConeGeometry(HEAD_WIDTH / 2, HEAD_REACH, 4);
    headGeometry.rotateZ(-Math.PI / 2);
    headGeometry.scale(1, 1, HEAD_THICKNESS / HEAD_WIDTH);
    headGeometry.translate(HEAD_REACH / 2, 0, 0);
    const head = new THREE.Mesh(
      headGeometry,
      new THREE.MeshStandardMaterial({ color: HEAD_COLOR, roughness: HEAD_ROUGHNESS, metalness: HEAD_METALNESS })
    );
    head.position.y = HANDLE_LENGTH;
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
