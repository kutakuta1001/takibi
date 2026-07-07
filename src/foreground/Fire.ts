import * as THREE from 'three';
import Alea from 'alea';
import type { AudioEngine } from '../audio/AudioEngine';
import { createFireCrackle, type Synth } from '../audio/synths';
import { loadPBR } from '../core/textures';
import type { GameState } from '../systems/GameState';
import type { Interactable } from '../systems/Interaction';

const STONE_COUNT = 8;
const STONE_RING_RADIUS = 0.75;
const STONE_RADIUS = 0.22;
const STONE_COLOR = 0x8a8478;
const STONE_RING_JITTER = 0.12;
const STONE_SCALE_MIN = 0.75;
const STONE_SCALE_MAX = 1.15;
const STONE_FLATTEN_MIN = 0.4;
const STONE_FLATTEN_MAX = 0.65;

const LOG_COUNT = 5;
const LOG_LENGTH = 1.1;
const LOG_RADIUS = 0.08;
const LOG_COLOR = 0x4a3527;

const FLAME_MIN_SCALE = 0.9;
const FLAME_MAX_SCALE = 1.6;
const FLAME_VIDEO_ASPECT = 480 / 432;
const FLAME_VIDEO_URL = '/fire/bonfire-loop.mp4';

const LIGHT_COLOR = 0xff8844;
const LIGHT_BASE_INTENSITY = 2;
const LIGHT_FUEL_INTENSITY = 6;
const LIGHT_FLICKER_AMOUNT = 0.3;
const LIGHT_DISTANCE = 22;
const LIGHT_HEIGHT = 0.6;
const NIGHT_LIGHT_BOOST = 1.3; // 夜(dayness=0)は火の光の存在感を1.3倍に強める

const SPARK_COUNT = 60;
const SPARK_BASE_RATE = 10;
const SPARK_RISE_SPEED_MIN = 0.5;
const SPARK_RISE_SPEED_MAX = 1.1;
const SPARK_SPREAD = 0.25;
const SPARK_LIFETIME_MIN = 0.8;
const SPARK_LIFETIME_MAX = 1.6;
const SPARK_HIDDEN_Y = -1000;
const SPARK_COLOR = 0xffaa44;
const SPARK_SIZE = 0.12;

const CRACKLE_FIXED_GAIN = 0.55; // 固定視点で常に焚き火から約2.5mのため、距離減衰は簡略化して固定値にする

const DECAL_RADIUS = 1.6;
const DECAL_SHADOW_OPACITY = 0.5;
const DECAL_GLOW_MAX_OPACITY = 0.6; // 火の光の照り返し（fireIntensity連動、夜に存在感が出る）

interface Spark {
  active: boolean;
  age: number;
  lifetime: number;
  velocity: THREE.Vector3;
}

/** 接地デカール（暗いラジアルグラデ = 擬似影）用のテクスチャ。 */
function createShadowDecalTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.9)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.5)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/** 火の光の照り返し（暖色の加算グロー）用のテクスチャ。 */
function createGlowDecalTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,150,60,0.9)');
    gradient.addColorStop(0.5, 'rgba(255,110,30,0.5)');
    gradient.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * 焚き火（campsite パノラマの地面位置、カメラから約2.5m）: 石の輪+薪組+炎+PointLight+火の粉+接地デカール。
 * v1 systems/Fire.ts から移植。固定視点のため、v1にあった「プレイヤーからの距離に応じた
 * クラックル音の減衰」は不要になり固定ゲインに簡略化した。
 * 炎は (a) v1のパーティクルスプライト と (b) CC0/Mixkitの実写炎動画ビルボード を実装時に比較し、
 * 写真の背景に馴染む (b) を採用した（比較スクリーンショットは報告に記載）。
 * 前景3Dをパノラマ写真の色に馴染ませるため、scene.environment（campsiteのPMREM）は main.ts が設定する。
 */
export class Fire {
  readonly position: THREE.Vector3;
  readonly interactable: Interactable;

  private readonly group: THREE.Group;
  private readonly light: THREE.PointLight;
  private readonly flameSprite: THREE.Sprite;
  private readonly sparks: Spark[] = [];
  private readonly sparkPoints: THREE.Points;
  private readonly crackle: Synth;
  private readonly glowDecalMaterial: THREE.MeshBasicMaterial;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    private readonly gs: GameState,
    audio: AudioEngine,
    position: THREE.Vector3
  ) {
    this.position = position.clone();

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    scene.add(this.group);

    this.glowDecalMaterial = this.buildGroundDecal();
    this.buildStoneRing();
    this.buildLogPile();
    this.flameSprite = this.buildFlameBillboard();

    this.light = new THREE.PointLight(LIGHT_COLOR, LIGHT_BASE_INTENSITY, LIGHT_DISTANCE);
    this.light.position.set(0, LIGHT_HEIGHT, 0);
    this.group.add(this.light);

    this.sparkPoints = this.buildSparkPoints();
    scene.add(this.sparkPoints);

    this.crackle = createFireCrackle(audio.ctx);
    const crackleGain = audio.ctx.createGain();
    crackleGain.gain.value = CRACKLE_FIXED_GAIN;
    this.crackle.output.connect(crackleGain);
    crackleGain.connect(audio.master);

    this.interactable = {
      object: this.group,
      prompt: (state) => (state.logs > 0 ? 'Eで薪をくべる' : '薪がない。木を切ろう'),
      canInteract: (state) => state.logs > 0,
      interact: (state) => {
        state.feedFire();
      },
    };
  }

  /** 焚き火本体・火の粉の表示/非表示（campsite にいる間だけ表示する。main.ts がスポット切替で呼ぶ）。 */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
    this.sparkPoints.visible = visible;
  }

  /** dayness: 1=夕(Grading未適用時のデフォルト)、0=夜。夜は焚き火の光の存在感を少し強める。 */
  update(dt: number, dayness = 1): void {
    this.time += dt;
    const intensity = this.gs.fireIntensity;

    this.updateLight(intensity, dayness);
    this.updateFlame(intensity);
    this.updateSparks(dt, intensity);
    this.glowDecalMaterial.opacity = intensity * DECAL_GLOW_MAX_OPACITY;

    this.crackle.setIntensity(intensity);
  }

  /** 暗いラジアルグラデの擬似影 + 火の光の照り返し（fireIntensity連動の加算グロー）を1枚ずつ敷く。 */
  private buildGroundDecal(): THREE.MeshBasicMaterial {
    const geometry = new THREE.CircleGeometry(DECAL_RADIUS, 32);
    geometry.rotateX(-Math.PI / 2);

    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: createShadowDecalTexture(),
      transparent: true,
      opacity: DECAL_SHADOW_OPACITY,
      depthWrite: false,
      toneMapped: false,
    });
    const shadow = new THREE.Mesh(geometry, shadowMaterial);
    shadow.position.y = 0.01;
    this.group.add(shadow);

    const glowMaterial = new THREE.MeshBasicMaterial({
      map: createGlowDecalTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const glow = new THREE.Mesh(geometry, glowMaterial);
    glow.position.y = 0.015;
    this.group.add(glow);

    return glowMaterial;
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

  /** CC0/Mixkitの実写炎動画（黒背景）を1枚のビルボードに加算合成する（黒が透明になり炎だけ浮き出る）。 */
  private buildFlameBillboard(): THREE.Sprite {
    const video = document.createElement('video');
    video.src = FLAME_VIDEO_URL;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    void video.play().catch(() => {
      /* ブラウザの自動再生制限。AudioEngine.unlock と同じ Title クリックのタイミングで再試行する。 */
    });

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, 0.3, 0);
    sprite.scale.set(FLAME_VIDEO_ASPECT, 1, 1);
    this.group.add(sprite);
    return sprite;
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
      toneMapped: false,
    });
    return new THREE.Points(geometry, material);
  }

  private updateLight(intensity: number, dayness: number): void {
    const flicker = Math.sin(this.time * 13) * LIGHT_FLICKER_AMOUNT;
    const nightBoost = THREE.MathUtils.lerp(NIGHT_LIGHT_BOOST, 1, dayness); // 夜は火の光の存在感を強める
    this.light.intensity = Math.max(0, (LIGHT_BASE_INTENSITY + intensity * LIGHT_FUEL_INTENSITY) * nightBoost + flicker);
  }

  private updateFlame(intensity: number): void {
    const scale = FLAME_MIN_SCALE + intensity * (FLAME_MAX_SCALE - FLAME_MIN_SCALE);
    this.flameSprite.scale.set(scale * FLAME_VIDEO_ASPECT, scale, 1);
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
