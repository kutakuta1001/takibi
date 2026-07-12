/** パノラマ空間の方向（yaw/pitch）と座標の相互変換ヘルパー。 */
import * as THREE from 'three';

// パノラマ球（半径50）の内側、レイキャストに十分な距離。HotspotMarker のデフォルト距離も
// これに揃える（ホットスポットの当たり球と同じ場所に光を置くため export する）。
export const HOTSPOT_DISTANCE = 8;

export interface HotspotDirection {
  yaw: number;
  pitch: number;
}

/**
 * 方向（yaw/pitch）+ 距離をワールド座標へ変換する。LookControls.applyRotation と同じ
 * camera.rotation.set(pitch, yaw, 0, 'YXZ') 規約に合わせる
 * （forward = (-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch))）。
 * HotspotMarker が「ホットスポットと同じ場所に光を置く」ためにも使う共通変換。
 */
export function directionToPosition(direction: HotspotDirection, distance: number): THREE.Vector3 {
  const x = -Math.sin(direction.yaw) * Math.cos(direction.pitch);
  const y = Math.sin(direction.pitch);
  const z = -Math.cos(direction.yaw) * Math.cos(direction.pitch);
  return new THREE.Vector3(x * distance, y * distance, z * distance);
}

/** directionToPosition の逆変換（実座標に置かれた3Dオブジェクトへ HotspotMarker を向けるために使う）。 */
export function positionToDirection(position: THREE.Vector3): { direction: HotspotDirection; distance: number } {
  const distance = position.length();
  const pitch = Math.asin(position.y / distance);
  const yaw = Math.atan2(-position.x, -position.z);
  return { direction: { yaw, pitch }, distance };
}
