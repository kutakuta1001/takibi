import * as THREE from 'three';
import Alea from 'alea';
import type { AudioEngine } from '../audio/AudioEngine';
import { createFireCrackle, type Synth } from '../audio/synths';
import { loadPBR } from '../core/textures';
import type { GameState } from '../systems/GameState';

const STONE_COUNT = 8;
const STONE_RING_RADIUS = 0.75;
const STONE_RADIUS = 0.22;
const STONE_COLOR = 0x8a8478;
const STONE_RING_JITTER = 0.12;
const STONE_SCALE_MIN = 0.75;
const STONE_SCALE_MAX = 1.15;
const STONE_FLATTEN_MIN = 0.4;
const STONE_FLATTEN_MAX = 0.65;

const LOG_COUNT = 4;
const LOG_LENGTH = 0.85;
const LOG_RADIUS = 0.06;
const LOG_INNER_GAP = 0.05; // 火に近い側の端が中心をわずかに越えて重なる量
const LOG_GROUND_OFFSET = 0.05;
const LOG_ANGLE_JITTER = 0.3; // rad。等間隔配置から少しずらして手積み感を出す
const LOG_LENGTH_JITTER = 0.2; // ±10%
const LOG_RADIUS_JITTER = 0.3; // ±15%
const LOG_TILT_JITTER = 0.12; // rad。完全な水平から少し傾ける
const LOG_BARK_TEXTURE_SIZE = 64;
const LOG_CHARCOAL_COLOR = { r: 26, g: 20, b: 16 }; // 焦げた黒炭
const LOG_EMBER_COLOR = { r: 168, g: 74, b: 24 }; // 熾火のオレンジ（火に近い側だけわずかに覗かせる）
const LOG_EMBER_BAND = 0.28; // v(0=外側/地面側, 1=火に近い側)の上位28%だけ熾火色を混ぜる
const LOG_BARK_GRAIN_FREQS: ReadonlyArray<{ freq: number; amplitude: number; phase: number }> = [
  { freq: 5, amplitude: 0.5, phase: 0 },
  { freq: 11, amplitude: 0.3, phase: 1.7 },
  { freq: 17, amplitude: 0.2, phase: 3.1 },
];
const LOG_BARK_NORMAL_STRENGTH = 0.6;

const FLAME_MIN_SCALE = 0.9;
const FLAME_MAX_SCALE = 1.6;
const FLAME_VIDEO_ASPECT = 480 / 432;
// 先頭スラッシュなしの相対パス。サブパス配信（GitHub Pages 等）でも解決できるよう
// panos と同じ方式に揃えている。
const FLAME_VIDEO_URL = 'fire/bonfire-loop.mp4';

const LIGHT_COLOR = 0xff8844;
const LIGHT_BASE_INTENSITY = 2;
const LIGHT_FUEL_INTENSITY = 6;
const LIGHT_FLICKER_AMOUNT = 0.3;
const LIGHT_DISTANCE = 22;
const LIGHT_HEIGHT = 0.6;
const NIGHT_LIGHT_BOOST = 1.3; // 夜(dayness=0)は火の光の存在感を1.3倍に強める
// 炎動画が使えないフォールバック時（ビルボード非表示）は炎そのものの視覚情報が失われるため、
// 薪・火の粉・光だけでも焚き火が成立するよう火の粉のスポーン率と光の強さを1.3倍に補強する。
const FALLBACK_NO_FLAME_BOOST = 1.3;

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
 * 薪の樹皮テクスチャ（色）。U方向（円周）は整数周波数のサイン合成で焦げた木目の縦筋を表現し
 * キャンバス端でシームレスにタイリングする（loadWaterNormal と同じ手法）。V方向（長さ）は
 * 0=外側(地面側)を焦げた黒炭、1=火に近い側の上位28%だけ熾火のオレンジをわずかに覗かせる。
 */
function createLogBarkTexture(): THREE.CanvasTexture {
  const width = LOG_BARK_TEXTURE_SIZE;
  const height = LOG_BARK_TEXTURE_SIZE * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imageData = ctx.createImageData(width, height);
    const twoPi = Math.PI * 2;
    for (let py = 0; py < height; py++) {
      // CanvasTexture は flipY のためキャンバス上端(py=0)がv=1(火に近い側)に対応する。
      const v = 1 - py / (height - 1);
      const emberMix = Math.max(0, (v - (1 - LOG_EMBER_BAND)) / LOG_EMBER_BAND);
      for (let px = 0; px < width; px++) {
        const u = px / width;
        let grain = 0;
        for (const layer of LOG_BARK_GRAIN_FREQS) {
          grain += Math.sin(u * twoPi * layer.freq + layer.phase) * layer.amplitude;
        }
        const shade = 1 + grain * 0.22;
        const r = (LOG_CHARCOAL_COLOR.r + (LOG_EMBER_COLOR.r - LOG_CHARCOAL_COLOR.r) * emberMix) * shade;
        const g = (LOG_CHARCOAL_COLOR.g + (LOG_EMBER_COLOR.g - LOG_CHARCOAL_COLOR.g) * emberMix) * shade;
        const b = (LOG_CHARCOAL_COLOR.b + (LOG_EMBER_COLOR.b - LOG_CHARCOAL_COLOR.b) * emberMix) * shade;
        const i = (py * width + px) * 4;
        imageData.data[i] = Math.min(255, Math.max(0, r));
        imageData.data[i + 1] = Math.min(255, Math.max(0, g));
        imageData.data[i + 2] = Math.min(255, Math.max(0, b));
        imageData.data[i + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 薪の樹皮ノーマルマップ。上のcolorテクスチャと同じU方向サイン合成の高さ場から解析的に
 * 勾配(dH/du)を求めてエンコードする（v方向は起伏なしのため dH/dv=0、loadWaterNormal と同じ手法）。
 * 縦筋の凹凸に焚き火の光を当てて樹皮らしい陰影を出す。
 */
function createLogBarkNormalTexture(): THREE.CanvasTexture {
  const size = LOG_BARK_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imageData = ctx.createImageData(size, size);
    const twoPi = Math.PI * 2;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = px / size;
        let dHdu = 0;
        for (const layer of LOG_BARK_GRAIN_FREQS) {
          dHdu += Math.cos(u * twoPi * layer.freq + layer.phase) * layer.amplitude * layer.freq * twoPi;
        }
        const normal = new THREE.Vector3(-dHdu * LOG_BARK_NORMAL_STRENGTH, 0, 1).normalize();
        const i = (py * size + px) * 4;
        imageData.data[i] = Math.round((normal.x * 0.5 + 0.5) * 255);
        imageData.data[i + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
        imageData.data[i + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
        imageData.data[i + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
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

  private readonly group: THREE.Group;
  private readonly light: THREE.PointLight;
  private readonly flameSprite: THREE.Sprite;
  private readonly flameVideo: HTMLVideoElement;
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
    const flame = this.buildFlameBillboard();
    this.flameSprite = flame.sprite;
    this.flameVideo = flame.video;

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

  /**
   * 薪はcos/sin方向（火に近い側=v1端）に少しだけ中心を越えて重なり、外側（v0端・地面側）へ
   * 張り出すよう位置をずらす（実際の焚き火の組み方に合わせ、中心を挟んで対称に貫通させない）。
   * 本数・傾き・太さ・長さに個体差を持たせ、均等に並んだ「作り物」感を減らす。
   */
  private buildLogPile(): void {
    const geometry = new THREE.CylinderGeometry(LOG_RADIUS, LOG_RADIUS, LOG_LENGTH, 8);
    const material = new THREE.MeshStandardMaterial({
      map: createLogBarkTexture(),
      normalMap: createLogBarkNormalTexture(),
      roughness: 0.95,
      metalness: 0,
    });

    const rand = Alea('takibi-fire-logs');
    for (let i = 0; i < LOG_COUNT; i++) {
      const angle = (i / LOG_COUNT) * Math.PI * 2 + (rand() - 0.5) * LOG_ANGLE_JITTER;
      const lengthScale = 1 + (rand() - 0.5) * LOG_LENGTH_JITTER;
      const radiusScale = 1 + (rand() - 0.5) * LOG_RADIUS_JITTER;
      const halfLength = (LOG_LENGTH * lengthScale) / 2;
      const shift = halfLength - LOG_INNER_GAP;

      const log = new THREE.Mesh(geometry, material);
      log.position.set(
        Math.cos(angle) * shift,
        LOG_RADIUS * radiusScale + LOG_GROUND_OFFSET,
        Math.sin(angle) * shift
      );
      log.rotation.z = Math.PI / 2;
      log.rotation.y = angle;
      log.rotation.x = (rand() - 0.5) * LOG_TILT_JITTER;
      log.scale.set(radiusScale, lengthScale, radiusScale);
      this.group.add(log);
    }
  }

  /**
   * CC0/Mixkitの実写炎動画（黒背景）を1枚のビルボードに加算合成する（黒が透明になり炎だけ浮き出る）。
   * ロード自体は元から非同期（video.src設定はブロッキングしない）。onerror・play()失敗時は
   * ビルボードだけ非表示にし、薪・石・火の粉・光・クラックル音で焚き火が成立するフォールバックに
   * 委ねる（前景3Dの他要素は影響を受けない）。play()の失敗はほぼ確実にブラウザの自動再生制限
   * （ユーザー操作前は再生をブロックされる）のため、main.ts が retryFlameVideo() を Title の
   * 「はじめる」クリック（=確実なユーザー操作）のタイミングで一度だけ呼び直す。
   */
  private buildFlameBillboard(): { sprite: THREE.Sprite; video: HTMLVideoElement } {
    const video = document.createElement('video');
    video.src = FLAME_VIDEO_URL;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

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

    video.onerror = () => {
      sprite.visible = false;
    };
    void video.play().catch(() => {
      sprite.visible = false;
    });

    return { sprite, video };
  }

  /**
   * ユーザー操作のタイミングで炎動画の再生を一度だけ再試行する。成功したらビルボードを
   * 再表示する（失敗時は何もしない=非表示のまま、他要素のフォールバックで焚き火は成立している）。
   */
  retryFlameVideo(): void {
    void this.flameVideo.play().then(
      () => {
        this.flameSprite.visible = true;
      },
      () => {
        /* 再試行も失敗。フォールバックのまま。 */
      }
    );
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
    const fallbackBoost = this.flameSprite.visible ? 1 : FALLBACK_NO_FLAME_BOOST;
    this.light.intensity = Math.max(
      0,
      (LIGHT_BASE_INTENSITY + intensity * LIGHT_FUEL_INTENSITY) * nightBoost * fallbackBoost + flicker
    );
  }

  private updateFlame(intensity: number): void {
    const scale = FLAME_MIN_SCALE + intensity * (FLAME_MAX_SCALE - FLAME_MIN_SCALE);
    this.flameSprite.scale.set(scale * FLAME_VIDEO_ASPECT, scale, 1);
  }

  private updateSparks(dt: number, intensity: number): void {
    const positionAttr = this.sparkPoints.geometry.attributes.position as THREE.BufferAttribute;
    const fallbackBoost = this.flameSprite.visible ? 1 : FALLBACK_NO_FLAME_BOOST;
    const spawnChance = SPARK_BASE_RATE * intensity * dt * fallbackBoost;

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
