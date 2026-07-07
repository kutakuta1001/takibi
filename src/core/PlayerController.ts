import * as THREE from 'three';
import { Input } from './Input';

const WALK_SPEED = 4; // m/s
const MOUSE_SENSITIVITY = 0.002;
const PITCH_LIMIT = (85 * Math.PI) / 180;
export const EYE_HEIGHT = 1.6;
const BOB_FREQUENCY = 7;
const BOB_AMPLITUDE = 0.04;

export class PlayerController {
  readonly position: THREE.Vector3;

  private yaw = 0;
  private pitch = 0;
  private bobTime = 0;
  private movementLocked = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly heightAt: (x: number, z: number) => number
  ) {
    this.position = camera.position.clone();
    this.position.y = this.heightAt(this.position.x, this.position.z) + EYE_HEIGHT;
    this.camera.position.copy(this.position);
  }

  /** 座りシーケンスなど、演出でWASD移動だけを止めたいときに使う（視点操作は継続する）。 */
  setMovementLocked(locked: boolean): void {
    this.movementLocked = locked;
  }

  update(dt: number): void {
    const { dx, dy } = this.input.lookDelta();
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));

    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const forwardX = -sinYaw;
    const forwardZ = -cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    let moveX = 0;
    let moveZ = 0;
    if (!this.movementLocked) {
      if (this.input.isDown('KeyW')) {
        moveX += forwardX;
        moveZ += forwardZ;
      }
      if (this.input.isDown('KeyS')) {
        moveX -= forwardX;
        moveZ -= forwardZ;
      }
      if (this.input.isDown('KeyD')) {
        moveX += rightX;
        moveZ += rightZ;
      }
      if (this.input.isDown('KeyA')) {
        moveX -= rightX;
        moveZ -= rightZ;
      }
    }

    const moving = moveX !== 0 || moveZ !== 0;
    if (moving) {
      const length = Math.hypot(moveX, moveZ);
      this.position.x += (moveX / length) * WALK_SPEED * dt;
      this.position.z += (moveZ / length) * WALK_SPEED * dt;
      this.bobTime += dt;
    }

    const baseY = this.heightAt(this.position.x, this.position.z) + EYE_HEIGHT;
    const bob = moving ? Math.sin(this.bobTime * BOB_FREQUENCY) * BOB_AMPLITUDE : 0;
    this.position.y = baseY + bob;

    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
