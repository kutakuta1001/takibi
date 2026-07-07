import * as THREE from 'three';
import Alea from 'alea';
import type { AudioEngine } from '../audio/AudioEngine';
import { createFireCrackle, type Synth } from '../audio/synths';
import { loadPBR } from '../core/textures';
import type { GameState } from './GameState';
import type { Interactable } from './Interaction';

const STONE_COUNT = 8;
const STONE_RING_RADIUS = 0.75;
const STONE_RADIUS = 0.22;
const STONE_COLOR = 0x8a8478; // rock テクスチャに乗せるトーン（落ち着いたグレー、白い卵状に見えないようにする）
const STONE_RING_JITTER = 0.12; // 輪の等間隔感を消すための半径ばらつき
const STONE_SCALE_MIN = 0.75;
const STONE_SCALE_MAX = 1.15;
const STONE_FLATTEN_MIN = 0.4; // 扁平度（Y方向スケール）の下限
const STONE_FLATTEN_MAX = 0.65; // 扁平度（Y方向スケール）の上限

const LOG_COUNT = 5;
const LOG_LENGTH = 1.1;
const LOG_RADIUS = 0.08;
const LOG_COLOR = 0x4a3527;

const FLAME_COUNT = 3;
const FLAME_MIN_SCALE = 0.15;
const FLAME_MAX_SCALE = 1.1;
const FLAME_FLICKER_FREQ = 13; // 光の揺らぎと同じ周波数に合わせる
const FLAME_FLICKER_AMOUNT = 0.25;

const LIGHT_COLOR = 0xff8844;
const LIGHT_BASE_INTENSITY = 2;
const LIGHT_FUEL_INTENSITY = 6;
const LIGHT_FLICKER_AMOUNT = 0.3;
const LIGHT_DISTANCE = 22;
const LIGHT_HEIGHT = 0.6;

const SPARK_COUNT = 60;
const SPARK_BASE_RATE = 10; // 満タン時の生成レート（個/秒）
const SPARK_RISE_SPEED_MIN = 0.5;
const SPARK_RISE_SPEED_MAX = 1.1;
const SPARK_SPREAD = 0.25;
const SPARK_LIFETIME_MIN = 0.8;
const SPARK_LIFETIME_MAX = 1.6;
const SPARK_HIDDEN_Y = -1000;
const SPARK_COLOR = 0xffaa44;
const SPARK_SIZE = 0.12;

const CRACKLE_MAX_DISTANCE = 25;

interface Spark {
  active: boolean;
  age: number;
  lifetime: number;
  velocity: THREE.Vector3;
}

/** 炎スプライト用の放射グラデーションテクスチャを手続き生成する（外部アセット不使用）。 */
function createGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,244,214,1)');
    gradient.addColorStop(0.4, 'rgba(255,160,60,0.9)');
    gradient.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * 焚き火: 石の輪+薪組+炎スプライト+PointLight+火の粉。GameState.fireIntensity（燃料）に連動して育つ。
 * クラックル音の距離減衰は update(dt, playerPos) が自身の position を使って内部で計算する。
 */
export class Fire {
  readonly position: THREE.Vector3;
  readonly interactable: Interactable;

  private readonly group: THREE.Group;
  private readonly light: THREE.PointLight;
  private readonly flames: THREE.Sprite[];
  private readonly sparks: Spark[] = [];
  private readonly sparkPoints: THREE.Points;
  private readonly crackle: Synth;
  private readonly crackleDistanceGain: GainNode;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    private readonly gs: GameState,
    audio: AudioEngine,
    groundHeight = 0
  ) {
    this.position = new THREE.Vector3(0, groundHeight, 0);

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    scene.add(this.group);

    this.buildStoneRing();
    this.buildLogPile();
    this.flames = this.buildFlames();

    this.light = new THREE.PointLight(LIGHT_COLOR, LIGHT_BASE_INTENSITY, LIGHT_DISTANCE);
    this.light.position.set(0, LIGHT_HEIGHT, 0);
    this.group.add(this.light);

    this.sparkPoints = this.buildSparkPoints();
    scene.add(this.sparkPoints);

    this.crackle = createFireCrackle(audio.ctx);
    this.crackleDistanceGain = audio.ctx.createGain();
    this.crackleDistanceGain.gain.value = 0;
    this.crackle.output.connect(this.crackleDistanceGain);
    this.crackleDistanceGain.connect(audio.master);

    this.interactable = {
      object: this.group,
      prompt: (gs) => (gs.logs > 0 ? 'Eで薪をくべる' : '薪がない。木を切ろう'),
      canInteract: (gs) => gs.logs > 0,
      interact: (gs) => {
        gs.feedFire();
      },
    };
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    this.time += dt;
    const intensity = this.gs.fireIntensity;

    this.updateLight(intensity);
    this.updateFlames(intensity);
    this.updateSparks(dt, intensity);

    this.crackle.setIntensity(intensity);
    const distance = this.position.distanceTo(playerPos);
    this.crackleDistanceGain.gain.value = Math.min(Math.max(1 - distance / CRACKLE_MAX_DISTANCE, 0), 1);
  }

  private buildStoneRing(): void {
    const geometry = new THREE.SphereGeometry(STONE_RADIUS, 8, 6);
    const rock = loadPBR('rock', 1);
    const material = new THREE.MeshStandardMaterial({
      map: rock.map,
      normalMap: rock.normalMap,
      roughnessMap: rock.roughnessMap,
      color: STONE_COLOR,
      metalness: 0,
    });

    const rand = Alea('takibi-fire-stones');
    for (let i = 0; i < STONE_COUNT; i++) {
      const angle = (i / STONE_COUNT) * Math.PI * 2;
      const radius = STONE_RING_RADIUS + (rand() - 0.5) * STONE_RING_JITTER;
      const flatten = STONE_FLATTEN_MIN + rand() * (STONE_FLATTEN_MAX - STONE_FLATTEN_MIN);
      const scaleXZ = STONE_SCALE_MIN + rand() * (STONE_SCALE_MAX - STONE_SCALE_MIN);

      const stone = new THREE.Mesh(geometry, material);
      stone.position.set(Math.cos(angle) * radius, STONE_RADIUS * flatten * 0.9, Math.sin(angle) * radius);
      stone.rotation.y = rand() * Math.PI * 2;
      stone.rotation.x = (rand() - 0.5) * 0.3;
      stone.scale.set(scaleXZ, flatten, scaleXZ * (0.85 + rand() * 0.3));
      stone.castShadow = true;
      stone.receiveShadow = true;
      this.group.add(stone);
    }
  }

  private buildLogPile(): void {
    const geometry = new THREE.CylinderGeometry(LOG_RADIUS, LOG_RADIUS, LOG_LENGTH, 8);
    const material = new THREE.MeshStandardMaterial({ color: LOG_COLOR });
    for (let i = 0; i < LOG_COUNT; i++) {
      const angle = (i / LOG_COUNT) * Math.PI * 2;
      const log = new THREE.Mesh(geometry, material);
      log.position.set(0, LOG_RADIUS + 0.05, 0);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = angle;
      this.group.add(log);
    }
  }

  private buildFlames(): THREE.Sprite[] {
    const texture = createGlowTexture();
    const flames: THREE.Sprite[] = [];
    for (let i = 0; i < FLAME_COUNT; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: LIGHT_COLOR,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set((Math.random() - 0.5) * 0.15, 0.3, (Math.random() - 0.5) * 0.15);
      this.group.add(sprite);
      flames.push(sprite);
    }
    return flames;
  }

  private buildSparkPoints(): THREE.Points {
    const positions = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT; i++) {
      positions[i * 3 + 1] = SPARK_HIDDEN_Y;
      this.sparks.push({ active: false, age: 0, lifetime: 0, velocity: new THREE.Vector3() });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: SPARK_COLOR,
      size: SPARK_SIZE,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geometry, material);
  }

  private updateLight(intensity: number): void {
    const flicker = Math.sin(this.time * 13) * LIGHT_FLICKER_AMOUNT;
    this.light.intensity = Math.max(0, LIGHT_BASE_INTENSITY + intensity * LIGHT_FUEL_INTENSITY + flicker);
  }

  private updateFlames(intensity: number): void {
    const baseScale = FLAME_MIN_SCALE + intensity * (FLAME_MAX_SCALE - FLAME_MIN_SCALE);
    for (let i = 0; i < this.flames.length; i++) {
      const flicker = 1 + Math.sin(this.time * FLAME_FLICKER_FREQ + i * 2.1) * FLAME_FLICKER_AMOUNT;
      const scale = Math.max(0.02, baseScale * flicker);
      this.flames[i].scale.set(scale, scale * 1.4, 1);
    }
  }

  private updateSparks(dt: number, intensity: number): void {
    const positionAttr = this.sparkPoints.geometry.attributes.position as THREE.BufferAttribute;
    const spawnChance = SPARK_BASE_RATE * intensity * dt;

    for (let i = 0; i < this.sparks.length; i++) {
      const spark = this.sparks[i];
      if (spark.active) {
        spark.age += dt;
        if (spark.age >= spark.lifetime) {
          spark.active = false;
          positionAttr.setY(i, SPARK_HIDDEN_Y);
          continue;
        }
        positionAttr.setX(i, positionAttr.getX(i) + spark.velocity.x * dt);
        positionAttr.setY(i, positionAttr.getY(i) + spark.velocity.y * dt);
        positionAttr.setZ(i, positionAttr.getZ(i) + spark.velocity.z * dt);
      } else if (intensity > 0 && Math.random() < spawnChance) {
        spark.active = true;
        spark.age = 0;
        spark.lifetime = SPARK_LIFETIME_MIN + Math.random() * (SPARK_LIFETIME_MAX - SPARK_LIFETIME_MIN);
        spark.velocity.set(
          (Math.random() - 0.5) * SPARK_SPREAD,
          SPARK_RISE_SPEED_MIN + Math.random() * (SPARK_RISE_SPEED_MAX - SPARK_RISE_SPEED_MIN),
          (Math.random() - 0.5) * SPARK_SPREAD
        );
        positionAttr.setXYZ(
          i,
          this.position.x + (Math.random() - 0.5) * 0.3,
          this.position.y + 0.35,
          this.position.z + (Math.random() - 0.5) * 0.3
        );
      }
    }
    positionAttr.needsUpdate = true;
  }
}
