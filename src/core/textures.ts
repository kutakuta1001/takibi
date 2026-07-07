import * as THREE from 'three';

export interface PBRSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap?: THREE.Texture;
}

const ANISOTROPY = 8;
const WATER_NORMAL_SIZE = 256;

// 水面のうねりを合成する正弦波レイヤー（周波数は整数のみ→キャンバス端でシームレスにタイリングする）。
const WATER_WAVE_LAYERS = [
  { freqX: 3, freqY: 1, amplitude: 1.0, phase: 0 },
  { freqX: -2, freqY: 3, amplitude: 0.6, phase: 1.3 },
  { freqX: 5, freqY: -2, amplitude: 0.35, phase: 2.7 },
  { freqX: -4, freqY: -4, amplitude: 0.2, phase: 4.1 },
];
const WATER_NORMAL_STRENGTH = 1.6;

const loader = new THREE.TextureLoader();
let cachedWaterNormal: THREE.Texture | null = null;

// Vitest（Node環境・document未定義）から Terrain 等を直接 new すると TextureLoader が
// createElementNS で落ちるため、ブラウザ以外では空テクスチャを返して構築だけ通す
// （実行時は Vite が常にブラウザで動くため本番挙動に影響しない）。
const isBrowser = typeof document !== 'undefined';

function loadTexture(url: string, repeat: number, colorSpace?: THREE.ColorSpace): THREE.Texture {
  if (!isBrowser) return new THREE.Texture();

  const texture = loader.load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = ANISOTROPY;
  if (colorSpace) texture.colorSpace = colorSpace;
  return texture;
}

/** grass/ground/bark/rock の color・normal・roughness を public/textures/<name>/ から読み込む。 */
export function loadPBR(name: 'grass' | 'ground' | 'bark' | 'rock', repeat: number): PBRSet {
  const base = `/textures/${name}`;
  return {
    map: loadTexture(`${base}/color.jpg`, repeat, THREE.SRGBColorSpace),
    normalMap: loadTexture(`${base}/normal.jpg`, repeat),
    roughnessMap: loadTexture(`${base}/roughness.jpg`, repeat),
  };
}

/**
 * 水面用ノーマルマップ。ambientCG / Poly Haven に流水表現へ適した CC0 の
 * 写真ノーマルマップが存在しなかったため（詳細は public/textures/ATTRIBUTION.md）、
 * Fire.ts の炎グロー・Cooking.ts の湯気と同じ canvas 手続き生成で代替する。
 * 整数周波数の正弦波を合成した高さ場から解析的に勾配を求め、OpenGL 規約のノーマルマップに
 * エンコードする（周波数が整数なのでキャンバス端がシームレスに繋がりタイリング可能）。
 */
export function loadWaterNormal(): THREE.Texture {
  if (cachedWaterNormal) return cachedWaterNormal;
  if (!isBrowser) return new THREE.Texture();

  const size = WATER_NORMAL_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imageData = ctx.createImageData(size, size);
    const twoPi = Math.PI * 2;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        let dHdx = 0;
        let dHdy = 0;

        for (const layer of WATER_WAVE_LAYERS) {
          const theta =
            (twoPi * (layer.freqX * px + layer.freqY * py)) / size + layer.phase;
          const c = Math.cos(theta) * layer.amplitude;
          dHdx += c * ((twoPi * layer.freqX) / size);
          dHdy += c * ((twoPi * layer.freqY) / size);
        }

        const normal = new THREE.Vector3(
          -dHdx * WATER_NORMAL_STRENGTH,
          -dHdy * WATER_NORMAL_STRENGTH,
          1
        ).normalize();

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
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  cachedWaterNormal = texture;
  return texture;
}
