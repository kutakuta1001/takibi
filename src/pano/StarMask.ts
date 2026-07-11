// equirect JPG の輝度から「空の方向だけ星を見せる」マスクを作る。
// PanoScene の SphereGeometry（コンストラクタで geometry.scale(-1, 1, 1) 適用済み）が
// 実際にテクスチャへ焼き込んでいるUVマッピングと一致させる必要があるため、その導出をここに記す:
//
// Three.js の SphereGeometry は内部パラメータ u,v(各0..1) から
//   theta = u * 2π, phi = v * π
//   x = -R cosθ sinφ, y = R cosφ, z = R sinθ sinφ
// を計算し、UV属性には (u, 1-v) を積む。scale(-1,1,1) は位置のx成分だけ反転するため、
// 実際の頂点位置は x' = R cosθ sinφ, y'=R cosφ, z'=R sinθ sinφ になる（UV自体は不変）。
// 与えられた単位方向 (x,y,z) からこれを逆算すると:
//   phi   = acos(y)                 // 0=天頂 .. π=天底
//   theta = atan2(z, x)  (0..2π に正規化)
//   u = theta / 2π
//   1-v = phi/π  →  v = 1 - phi/π
// テクスチャ座標(v)は0=画像下端/1=画像上端に対応する（Three.jsのUV/flipY既定の組み合わせで
// 「画像をそのまま貼ると上下反転しない」という標準挙動になるため）。よって画像内の行インデックス
// （0=画像最上段）は row = (phi/π) * height、列は col = u * width で求まる。

export interface Direction {
  x: number;
  y: number;
  z: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(x: number, edge0: number, edge1: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 単位方向ベクトルから equirect 画像のピクセル座標（列, 行。0=左上原点）を求める。 */
export function directionToEquirectPixel(
  dir: Direction,
  width: number,
  height: number
): { col: number; row: number } {
  const phi = Math.acos(clamp(dir.y, -1, 1));
  let theta = Math.atan2(dir.z, dir.x);
  if (theta < 0) theta += Math.PI * 2;
  const u = theta / (Math.PI * 2);

  const col = clamp(Math.floor(u * width), 0, width - 1);
  const row = clamp(Math.floor((phi / Math.PI) * height), 0, height - 1);
  return { col, row };
}

/** RGBA(Uint8ClampedArray) の指定ピクセルの相対輝度(0..1)。 */
export function sampleLuminance(pixels: Uint8ClampedArray, width: number, col: number, row: number): number {
  const i = (row * width + col) * 4;
  const r = pixels[i];
  const g = pixels[i + 1];
  const b = pixels[i + 2];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// 実写equirectで「空」とみなす輝度閾値と、閾値付近を滑らかにする範囲（急に星が消える/現れるのを防ぐ）。
export const SKY_LUMINANCE_THRESHOLD = 0.45;
export const SKY_LUMINANCE_SOFT_RANGE = 0.1;

/**
 * 各方向について、その方向の画像ピクセルが閾値以上に明るい（=空）場合だけ値を持つマスクを作る
 * （樹冠・岩は写真上で暗いため0に近づき、除外される）。
 */
export function buildStarLuminanceMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  directions: readonly Direction[]
): Float32Array {
  const mask = new Float32Array(directions.length);
  for (let i = 0; i < directions.length; i++) {
    const { col, row } = directionToEquirectPixel(directions[i], width, height);
    const luminance = sampleLuminance(pixels, width, col, row);
    mask[i] = smoothstep(luminance, SKY_LUMINANCE_THRESHOLD - SKY_LUMINANCE_SOFT_RANGE, SKY_LUMINANCE_THRESHOLD + SKY_LUMINANCE_SOFT_RANGE);
  }
  return mask;
}

const MASK_CANVAS_WIDTH = 256;
const MASK_CANVAS_HEIGHT = 128;

/**
 * equirect画像（読み込み済みテクスチャのimage）を縮小Canvasに描き、各方向の輝度マスクを作る。
 * Canvas取得に失敗した場合は安全側（全方向表示）にフォールバックする。
 */
export function computeStarMaskFromImage(image: CanvasImageSource, directions: readonly Direction[]): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = MASK_CANVAS_WIDTH;
  canvas.height = MASK_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Float32Array(directions.length).fill(1);

  ctx.drawImage(image, 0, 0, MASK_CANVAS_WIDTH, MASK_CANVAS_HEIGHT);
  const { data } = ctx.getImageData(0, 0, MASK_CANVAS_WIDTH, MASK_CANVAS_HEIGHT);
  return buildStarLuminanceMask(data, MASK_CANVAS_WIDTH, MASK_CANVAS_HEIGHT, directions);
}
