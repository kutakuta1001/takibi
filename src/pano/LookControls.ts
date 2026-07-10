import * as THREE from 'three';

const SENSITIVITY = 0.002; // v1 PlayerController の MOUSE_SENSITIVITY と同じ値
const PITCH_LIMIT = (80 * Math.PI) / 180;
const INERTIA_DAMPING_PER_SECOND = 0.05; // 1秒あたりに角速度をこの比率まで減衰させる
const INERTIA_STOP_THRESHOLD = 0.001; // これ未満の角速度（rad/s）は0とみなして揺れを止める

// 無操作時の「呼吸」揺らぎ（居る感）。酔い防止のため振幅は厳守する（0.10〜0.15度の範囲内）。
const IDLE_SWAY_PERIOD_SECONDS = 4.5;
const IDLE_SWAY_AMPLITUDE_RAD = (0.13 * Math.PI) / 180;
const IDLE_SWAY_FADE_IN_SECONDS = 3; // ゆっくりフェードイン
const NO_SWAY = { yaw: 0, pitch: 0 };

function clampPitch(pitch: number): number {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
}

/** 角度差を [-π, π] に正規化する（lookAt の最短経路アニメーション用）。 */
function normalizeAngleDelta(delta: number): number {
  const twoPi = Math.PI * 2;
  let d = delta % twoPi;
  if (d > Math.PI) d -= twoPi;
  if (d < -Math.PI) d += twoPi;
  return d;
}

interface LookAtAnimation {
  fromYaw: number;
  fromPitch: number;
  toYaw: number;
  toPitch: number;
  elapsed: number;
  duration: number;
  resolve: () => void;
}

/**
 * マウスドラッグによる見回し（慣性減衰付き・pitch ±80度clamp）。PointerLockは使わない。
 * enabled=false の間はユーザードラッグ入力を無視するが、lookAt() による演出アニメーションは継続する
 * （SpotManager の遷移中や Cooking の座って飲む演出で使う）。
 */
export class LookControls {
  enabled = true;

  private yaw = 0;
  private pitch = 0;
  private yawVelocity = 0; // rad/s
  private pitchVelocity = 0; // rad/s
  private dragging = false;
  private lastMoveTime = 0;
  private animation: LookAtAnimation | null = null;
  private swayTime = 0;
  private swayFade = 0; // 0..1。ドラッグ開始/lookAt開始で即座に0へ落とす

  /** 現在の視点（Cooking の座って飲む演出が、終了後に元の視点へ戻すために使う）。 */
  get currentYaw(): number {
    return this.yaw;
  }

  get currentPitch(): number {
    return this.pitch;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.dragging = true;
    this.animation = null;
    this.swayFade = 0; // ドラッグ開始で呼吸揺らぎを即座にフェードアウト
    this.yawVelocity = 0;
    this.pitchVelocity = 0;
    this.lastMoveTime = performance.now();
    this.domElement.setPointerCapture(e.pointerId);
    this.domElement.style.cursor = 'grabbing';
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;

    const now = performance.now();
    const dt = Math.max((now - this.lastMoveTime) / 1000, 1 / 240);
    this.lastMoveTime = now;

    const yawDelta = -e.movementX * SENSITIVITY;
    const pitchDelta = -e.movementY * SENSITIVITY;

    this.yaw += yawDelta;
    this.pitch = clampPitch(this.pitch + pitchDelta);

    this.yawVelocity = yawDelta / dt;
    this.pitchVelocity = pitchDelta / dt;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.domElement.hasPointerCapture(e.pointerId)) {
      this.domElement.releasePointerCapture(e.pointerId);
    }
    this.domElement.style.cursor = 'grab';
  };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly domElement: HTMLElement
  ) {
    this.domElement.style.cursor = 'grab';
    this.domElement.style.touchAction = 'none';
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointermove', this.onPointerMove);
    this.domElement.addEventListener('pointerup', this.onPointerUp);
    this.domElement.addEventListener('pointercancel', this.onPointerUp);
  }

  update(dt: number): void {
    if (this.animation) {
      this.updateAnimation(dt);
      this.applyRotation();
      return;
    }

    if (!this.dragging) {
      const damping = Math.pow(INERTIA_DAMPING_PER_SECOND, dt);
      this.yawVelocity *= damping;
      this.pitchVelocity *= damping;
      if (Math.abs(this.yawVelocity) < INERTIA_STOP_THRESHOLD) this.yawVelocity = 0;
      if (Math.abs(this.pitchVelocity) < INERTIA_STOP_THRESHOLD) this.pitchVelocity = 0;

      this.yaw += this.yawVelocity * dt;
      this.pitch = clampPitch(this.pitch + this.pitchVelocity * dt);

      this.swayTime += dt;
      this.swayFade = Math.min(1, this.swayFade + dt / IDLE_SWAY_FADE_IN_SECONDS);
    }

    this.applyRotation();
  }

  /** 視点を指定の yaw/pitch へ滑らかに動かす（座って飲む演出など）。完了時に Promise が解決する。 */
  lookAt(yaw: number, pitch: number, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.dragging = false;
      this.yawVelocity = 0;
      this.pitchVelocity = 0;
      this.swayFade = 0; // 演出アニメーション中は呼吸揺らぎを重ねない
      this.animation = {
        fromYaw: this.yaw,
        fromPitch: this.pitch,
        toYaw: this.yaw + normalizeAngleDelta(yaw - this.yaw),
        toPitch: clampPitch(pitch),
        elapsed: 0,
        duration: Math.max(seconds, 0.0001),
        resolve,
      };
    });
  }

  private updateAnimation(dt: number): void {
    const anim = this.animation;
    if (!anim) return;

    anim.elapsed += dt;
    const t = Math.min(anim.elapsed / anim.duration, 1);
    const eased = t * t * (3 - 2 * t); // smoothstep

    this.yaw = THREE.MathUtils.lerp(anim.fromYaw, anim.toYaw, eased);
    this.pitch = THREE.MathUtils.lerp(anim.fromPitch, anim.toPitch, eased);

    if (t >= 1) {
      this.animation = null;
      anim.resolve();
    }
  }

  /** 無操作時に呼吸のようにゆっくり揺れるyaw/pitchの微小オフセット（振幅0.13度・swayFadeで補間）。 */
  private computeIdleSway(): { yaw: number; pitch: number } {
    if (this.swayFade <= 0) return NO_SWAY;
    const phase = (this.swayTime / IDLE_SWAY_PERIOD_SECONDS) * Math.PI * 2;
    const amount = IDLE_SWAY_AMPLITUDE_RAD * this.swayFade;
    return {
      yaw: Math.sin(phase) * amount,
      pitch: Math.sin(phase + Math.PI / 2) * amount,
    };
  }

  private applyRotation(): void {
    const sway = this.computeIdleSway();
    this.camera.rotation.set(this.pitch + sway.pitch, this.yaw + sway.yaw, 0, 'YXZ');
  }
}
