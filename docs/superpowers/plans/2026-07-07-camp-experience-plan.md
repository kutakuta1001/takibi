# Takibi（キャンプ体験ウェブアプリ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブラウザで森のキャンプ体験（歩く・木を切る・焚き火を育てる・水を汲む・コーヒーを淹れる）ができる 3D 一人称ウェブアプリを構築する。

**Architecture:** Vanilla Three.js + TypeScript + Vite。純ロジックの GameState（イベントエミッタ）を中心に、systems が状態を書き換え、world/audio が購読して反応する一方向データフロー。世界は手続き生成（外部3Dアセットなし）、音は Web Audio API の手続き合成。Theme インターフェースで森林／雪山を差し替え可能にする。

**Tech Stack:** three / simplex-noise / alea（seed付きノイズ）、TypeScript、Vite、Vitest。物理エンジン・React・ポストプロセスは使わない。

**Spec:** `docs/superpowers/specs/2026-07-07-camp-experience-design.md`（必読。本計画より詳しい体験仕様・音響設計あり）

## Global Constraints

- 依存は dependencies: `three` `simplex-noise` `alea` のみ。devDependencies: `typescript` `vite` `vitest` `@types/three` `@types/alea` のみ。追加時は CEO 承認必須
- 全ワールドは seed 固定（`alea('takibi')`）で決定的に生成する（テスト可能性のため）
- GameState と systems のロジックは Three.js 非依存（`import * as THREE` 禁止は GameState.ts のみ厳格適用）
- UI 文言は日本語。ドキュメント・コメントに絵文字を使わない
- 各タスク完了時に `npm run build` と `npm run test` がグリーンであること
- 定数: 地形 SIZE=200（±100m）、視点高 EYE_HEIGHT=1.6、歩行速度 4 m/s、川中心 RIVER_X=30・幅6、
  昼夜周期 600 秒、薪1本の燃料 25 / 上限 100 / 減衰 0.5/秒、コーヒー抽出 30 秒、インタラクト射程 3m
- ブラウザ手動確認は `npm run dev` → http://localhost:5173 で行い、確認項目を報告する

---

## Phase 0: スキャフォールド（歩ける世界）

### Task 1: プロジェクト初期化

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `.gitignore`, `src/style.css`

**Interfaces:**
- Produces: `npm run dev` / `npm run build` / `npm run test` の3コマンド

- [ ] **Step 1: package.json 等を作成**

```json
{
  "name": "takibi",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "three": "^0.170.0",
    "simplex-noise": "^4.0.3",
    "alea": "^1.0.1"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "@types/three": "^0.170.0",
    "@types/alea": "^0.0.3"
  }
}
```

tsconfig.json: `"strict": true, "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "lib": ["ES2022", "DOM"]`。
index.html: `<div id="app"></div><div id="ui-root"></div>` と `<script type="module" src="/src/main.ts">`。
style.css: `html,body{margin:0;height:100%;overflow:hidden}` と `#ui-root` を position:fixed のオーバーレイに。
main.ts は暫定で `console.log('takibi boot')` のみ。.gitignore: `node_modules/ dist/`。

- [ ] **Step 2: インストールと検証**

Run: `npm install && npm run build && npm run test`
Expected: build 成功。test は「テストファイルなし」でも exit 0 になるよう `vitest run --passWithNoTests` を scripts に反映（`"test": "vitest run --passWithNoTests"`）

- [ ] **Step 3: Commit** — `git add -A && git commit -m "chore: scaffold vite + three + vitest project"`

### Task 2: Engine（描画ループと最小シーン）

**Files:**
- Create: `src/core/Engine.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `class Engine { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; onUpdate(cb: (dt: number) => void): void; start(): void }`
  カメラ初期位置 (0, 1.6, 8)。resize 対応込み。dt は秒（clamp 0.1 上限）

- [ ] **Step 1: Engine.ts 実装** — WebGLRenderer(antialias, `setPixelRatio(Math.min(devicePixelRatio, 2))`)、Scene に `new THREE.FogExp2(0xcfd8dc, 0.02)`、暫定の HemisphereLight(0xbfd4e5, 0x3e2f23, 1.0) と PlaneGeometry(200,200) の灰緑地面、`renderer.setAnimationLoop` でループし登録済み onUpdate コールバックに dt を渡す
- [ ] **Step 2: main.ts で Engine を起動** — Run: `npm run dev` → 地平線とフォグのかかった平面が見える（スクリーンショット確認）
- [ ] **Step 3: `npm run build` グリーン確認 → Commit** — `feat: engine with render loop, fog and placeholder ground`

### Task 3: 一人称操作（Input / PlayerController / 最小タイトル）

**Files:**
- Create: `src/core/Input.ts`, `src/core/PlayerController.ts`, `src/ui/Title.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces:
  - `class Input { isDown(code: string): boolean; onKeyPress(code: string, cb: () => void): void; lookDelta(): {dx: number, dy: number} }`（PointerLock 中のみ mousemove を蓄積）
  - `class PlayerController { constructor(camera, input, heightAt: (x: number, z: number) => number); update(dt: number): void; position: THREE.Vector3 }`
    WASD 4m/s・マウス感度 0.002・pitch は ±85 度で clamp・y = heightAt(x,z) + 1.6。
    移動中のみ控えめな歩行ボブ（`Math.sin(t * 7) * 0.04` を y に加算）
  - `class Title { constructor(onStart: () => void); show(): void; hide(): void }`（`#ui-root` に全画面 DOM。クリックで `document.body.requestPointerLock()` → onStart）
- Consumes: Task 2 の Engine。heightAt はこの時点では `() => 0` を渡す

- [ ] **Step 1: Input / PlayerController / Title 実装**（タイトルは黒背景に「Takibi — クリックではじめる」のみの最小版）
- [ ] **Step 2: 手動確認** — Run: `npm run dev` → クリックで視点ロック、WASD で平面上を歩ける、Esc で解除
- [ ] **Step 3: Commit** — `feat: first-person controls with pointer lock and title gate`

### Task 4: Terrain（起伏地形と川筋・テスト付き）

**Files:**
- Create: `src/world/Terrain.ts`, `tests/terrain.test.ts`
- Modify: `src/main.ts`（暫定地面を Terrain.mesh に置換、PlayerController に `terrain.heightAt` を接続）

**Interfaces:**
- Produces: `class Terrain { readonly mesh: THREE.Mesh; heightAt(x: number, z: number): number; isInRiver(x: number, z: number): boolean; static readonly SIZE = 200; static readonly WATER_LEVEL = -1.2 }`
- 高さ関数（この式をそのまま実装）:

```ts
import { createNoise2D } from 'simplex-noise';
import Alea from 'alea';
const noise2D = createNoise2D(Alea('takibi'));
// 基本起伏: 2オクターブ
const base = noise2D(x / 40, z / 40) * 3 + noise2D(x / 12, z / 12) * 0.8;
// 川筋の掘り下げ: x=30 を中心に幅6m を滑らかに 2.5m 沈める
const d = Math.abs(x - 30);
const t = Math.min(Math.max(1 - d / 6, 0), 1);          // 0..1
const carve = 2.5 * t * t * (3 - 2 * t);                 // smoothstep
return base - carve;
```

- mesh は PlaneGeometry(200, 200, 128, 128) を回転させ、各頂点 y に heightAt を適用。
  川面は別平面（y = WATER_LEVEL、色 0x4a7a8c、透明度 0.8）を x=30 に沿って幅 8 で敷く。
  isInRiver は `Math.abs(x - 30) < 4`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from 'vitest';
import { Terrain } from '../src/world/Terrain';
describe('Terrain', () => {
  it('is deterministic for the fixed seed', () => {
    const a = new Terrain(); const b = new Terrain();
    expect(a.heightAt(10, 10)).toBeCloseTo(b.heightAt(10, 10), 10);
  });
  it('carves the river lower than its banks', () => {
    const t = new Terrain();
    expect(t.heightAt(30, 0)).toBeLessThan(t.heightAt(50, 0) - 1.0);
  });
  it('detects river zone', () => {
    const t = new Terrain();
    expect(t.isInRiver(30, 5)).toBe(true);
    expect(t.isInRiver(0, 0)).toBe(false);
  });
});
```

注: Terrain のコンストラクタで THREE のジオメトリ生成が走るため、jsdom 不要な純計算（heightAt）とメッシュ生成を分離してもよい（`heightAt` をモジュール関数 `terrainHeight(x,z)` として export し、テストはそれを対象にするのが望ましい）。

- [ ] **Step 2: テスト失敗を確認** — Run: `npm run test` / Expected: FAIL（Terrain 未実装）
- [ ] **Step 3: Terrain 実装 + main.ts 接続**
- [ ] **Step 4: テスト成功と手動確認** — `npm run test` PASS、`npm run dev` で起伏を歩ける・川の窪みに水面が見える
- [ ] **Step 5: Commit** — `feat: procedural terrain with carved river`

## Phase 1: 森の世界

### Task 5: Theme インターフェースと ForestTheme

**Files:**
- Create: `src/theme/Theme.ts`, `src/theme/ForestTheme.ts`
- Modify: `src/core/Engine.ts`（fog 色を theme から）、`src/world/Terrain.ts`（地面色を theme.ground.color から。
  Task 4 のテスト互換のため `constructor(theme?: Theme)` と省略可能にし、省略時は ForestTheme）、`src/main.ts`

**Interfaces:**
- Produces:

```ts
export interface Theme {
  name: string;
  fog: { color: number; density: number };
  sky: { dayTop: number; dayBottom: number; nightTop: number; nightBottom: number };
  ground: { color: number };
  trees: { count: number; radius: number; trunkColor: number; leafColor: number };
  ambient: { windLevel: number; birds: boolean; insectsAtNight: boolean; snowfall: boolean };
}
export const ForestTheme: Theme = {
  name: 'forest',
  fog: { color: 0xcfd8dc, density: 0.018 },
  sky: { dayTop: 0x7ec8e3, dayBottom: 0xdfeff5, nightTop: 0x0b1026, nightBottom: 0x1b2a4a },
  ground: { color: 0x4a5d3a },
  trees: { count: 400, radius: 95, trunkColor: 0x5b4633, leafColor: 0x2f4f2f },
  ambient: { windLevel: 0.5, birds: true, insectsAtNight: true, snowfall: false },
};
```

- 以後のタスクはすべて Theme 経由で色・パラメータを参照する（ハードコード禁止）。main.ts の `const theme = ForestTheme` が唯一の切替点
- [ ] **Step 1: 実装と全既存色の Theme 参照への置換 → build/test グリーン → Commit** — `feat: theme abstraction with forest theme`

### Task 6: Forest（背景の木と伐採可能な木）

**Files:**
- Create: `src/world/Forest.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Terrain.heightAt` / `Terrain.isInRiver`、Theme.trees
- Produces: `class Forest { constructor(theme, terrain); readonly group: THREE.Group; readonly choppableTrees: ChoppableTree[] }`
  `class ChoppableTree { readonly object: THREE.Group; readonly position: THREE.Vector3; hitsRemaining: number /* 初期4 */; chop(): 'hit' | 'felled'; }`

- 木の形状: 幹 CylinderGeometry(0.25, 0.4, 3) + 葉 ConeGeometry(1.6, 4, 8) を2段。背景木は幹・葉それぞれ InstancedMesh（count は theme.trees.count）。seed 付き乱数（Alea('takibi-forest')）で半径 theme.trees.radius 内に配置し、`isInRiver` と キャンプ場（原点半径12m）を除外、y は heightAt
- 伐採可能木: キャンプ場周縁（原点から 14〜20m）に 6 本、個別 Group で配置。`chop()` は hitsRemaining を減らし、0 で 'felled' を返す（倒木アニメと薪化は Task 11）
- [ ] **Step 1: 実装 → 手動確認**（森が広がる・川と焚き火予定地に木が生えていない・60fps 近辺を DevTools で確認）→ Commit — `feat: instanced forest with choppable trees near camp`

### Task 7: Sky（昼夜サイクル）

**Files:**
- Create: `src/world/Sky.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `class Sky { constructor(scene, theme); update(dt: number): void; get dayness(): number /* 0=真夜中,1=真昼 */; timeOfDay: number /* 0..1, 初期値 0.35=午前 */ }`
- 周期 600 秒。DirectionalLight（太陽）を timeOfDay で回転、夜は強度 0.05 まで低下し月光（淡青 0x8899bb, 0.15）に交代。空は大きな球の ShaderMaterial（上下2色グラデ、day/night 色を dayness で lerp）。夜のみ THREE.Points の星 800 個を表示（opacity を dayness で反転）。fog 色も dayness で昼夜補間
- [ ] **Step 1: 実装 → 手動確認**（タイトルで `timeOfDay` を 0.9 に一時設定して夜を確認 → 戻す）→ Commit — `feat: day-night cycle with sun, moon and stars`

### Task 8: AudioEngine と環境音レイヤー

**Files:**
- Create: `src/audio/AudioEngine.ts`, `src/audio/synths.ts`
- Modify: `src/ui/Title.ts`（クリック時に unlock）、`src/main.ts`

**Interfaces:**
- Produces:
  - `class AudioEngine { readonly ctx: AudioContext; unlock(): void; readonly master: GainNode }`
  - synths.ts（各関数は `{ output: AudioNode, setIntensity(v: number): void }` を返す）:
    `createWind(ctx)`（ホワイトノイズ→BiquadFilter lowpass 400Hz、ゲインを LFO 0.05Hz でゆらす）
    `createRiver(ctx)`（ノイズ→bandpass 800Hz Q=0.8、setIntensity で距離ゲイン）
    `createBirds(ctx)`（8〜20秒ランダム間隔で FM チャープ 2〜4 音。dayness>0.4 のときのみ）
    `createInsects(ctx)`（高域ノイズのパルス列。dayness<0.3 のときのみ）
    SFX: `playChop(ctx, dest)` `playTreeFall` `playPickup` `playWaterFill` `playSip`（短いノイズバースト＋エンベロープ合成。実装詳細は任せるが必ず鳴ること）
- main.ts のループで毎フレーム: 川音ゲイン = `clamp(1 - distanceToRiver / 40, 0, 1) * 0.6`、鳥/虫の有効化を Sky.dayness と Theme.ambient で制御
- [ ] **Step 1: 実装 → 手動確認**（開始直後に風、川に近づくと川音が増す、時刻で鳥と虫が入れ替わる）→ Commit — `feat: procedural ambient audio layers`

## Phase 2: 体験コア

### Task 9: GameState（純ロジック・完全テスト）

**Files:**
- Create: `src/systems/GameState.ts`, `tests/gamestate.test.ts`

**Interfaces:**
- Produces（この署名を厳守。後続タスク全部がこれに依存する）:

```ts
export type KettleState = 'empty' | 'filled' | 'onFire' | 'ready';
export type GameEvent = 'logs-changed' | 'fire-changed' | 'kettle-changed' | 'coffee-drunk';
export class GameState {
  static readonly FUEL_PER_LOG = 25;
  static readonly FUEL_MAX = 100;
  static readonly FUEL_DECAY = 0.5;      // per second
  static readonly BREW_SECONDS = 30;
  get logs(): number;
  get fireFuel(): number;                 // 0..FUEL_MAX
  get fireIntensity(): number;            // fireFuel / FUEL_MAX
  get kettle(): KettleState;
  get brewProgress(): number;             // 0..1
  on(event: GameEvent, cb: () => void): void;
  addLogs(n: number): void;
  feedFire(): boolean;      // logs>0 のとき薪を1消費し fuel+=25(clamp)。成功で true
  fillKettle(): boolean;    // 'empty' -> 'filled'
  putKettleOnFire(): boolean; // 'filled' かつ fireFuel>0 -> 'onFire'、brewProgress リセット
  drinkCoffee(): boolean;   // 'ready' -> 'empty'、'coffee-drunk' 発火
  tick(dt: number): void;   // fuel 減衰。'onFire' かつ fireFuel>0 なら brew 進行、完了で 'ready'
}
```

- [ ] **Step 1: 失敗するテストを書く**（以下を tests/gamestate.test.ts にそのまま使用）

```ts
import { describe, it, expect } from 'vitest';
import { GameState } from '../src/systems/GameState';

describe('GameState', () => {
  it('feeds fire only when logs exist', () => {
    const gs = new GameState();
    expect(gs.feedFire()).toBe(false);
    gs.addLogs(2);
    expect(gs.feedFire()).toBe(true);
    expect(gs.logs).toBe(1);
    expect(gs.fireFuel).toBe(25);
  });
  it('clamps fuel at FUEL_MAX and decays over time', () => {
    const gs = new GameState();
    gs.addLogs(10);
    for (let i = 0; i < 10; i++) gs.feedFire();
    expect(gs.fireFuel).toBe(100);
    gs.tick(10);
    expect(gs.fireFuel).toBeCloseTo(95);
  });
  it('runs the kettle state machine to coffee', () => {
    const gs = new GameState();
    gs.addLogs(1); gs.feedFire();
    expect(gs.putKettleOnFire()).toBe(false);   // まだ水がない
    expect(gs.fillKettle()).toBe(true);
    expect(gs.putKettleOnFire()).toBe(true);
    gs.tick(30);
    expect(gs.kettle).toBe('ready');
    expect(gs.drinkCoffee()).toBe(true);
    expect(gs.kettle).toBe('empty');
  });
  it('pauses brewing when the fire dies', () => {
    const gs = new GameState();
    gs.addLogs(1); gs.feedFire(); gs.fillKettle(); gs.putKettleOnFire();
    gs.tick(15);
    // 残り燃料を強制的に使い切る（25 - 15*0.5 = 17.5 → 35秒で0）
    gs.tick(40);
    expect(gs.kettle).toBe('onFire');            // 火が消えて進行停止、readyにならない
    expect(gs.brewProgress).toBeLessThan(1);
  });
  it('emits events', () => {
    const gs = new GameState();
    let fired = 0;
    gs.on('logs-changed', () => fired++);
    gs.addLogs(3);
    expect(fired).toBe(1);
  });
});
```

- [ ] **Step 2: 失敗確認** — `npm run test` → FAIL
- [ ] **Step 3: GameState 実装**（THREE import 禁止。brew は fireFuel>0 の間だけ dt を累積し、累積>=30 で 'ready'）
- [ ] **Step 4: `npm run test` PASS 確認**
- [ ] **Step 5: Commit** — `feat: game state with fire fuel and kettle state machine (TDD)`

### Task 10: Interaction と HUD

**Files:**
- Create: `src/systems/Interaction.ts`, `src/ui/HUD.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces:

```ts
export interface Interactable {
  object: THREE.Object3D;                      // raycast 対象（子含む）
  prompt(gs: GameState): string;               // 例「Eで木を切る」
  canInteract(gs: GameState): boolean;
  interact(gs: GameState): void;
}
export class Interaction {
  constructor(camera: THREE.Camera, input: Input, gs: GameState);
  add(i: Interactable): void;
  remove(i: Interactable): void;
  update(): { prompt: string | null };         // 射程3m・画面中央レイキャスト
}
export class HUD {
  setPrompt(text: string | null): void;        // 画面中央下の文脈プロンプト
  setInventory(logs: number, kettle: KettleState): void;  // 左下トレイ（テキストベースで可）
  flashMessage(text: string, seconds?: number): void;      // 「コーヒーができた」等
}
```

- Consumes: Task 9 の GameState（イベント購読で HUD.setInventory を自動更新）
- Eキー押下時: 現在のターゲットが canInteract なら interact、できないが prompt があるなら誘導文言を flashMessage（例: 薪なし→「薪がない。木を切ろう」）
- [ ] **Step 1: 実装 → 手動確認**（次タスクの木が未接続のため、確認は仮 Interactable の岩などで可）→ Commit — `feat: raycast interaction system and HUD`

### Task 11: Chopping（伐採と薪拾い）

**Files:**
- Create: `src/systems/Chopping.ts`
- Modify: `src/main.ts`（Forest.choppableTrees を Interactable 登録）

**Interfaces:**
- Consumes: `ChoppableTree.chop()`（Task 6）、`GameState.addLogs`、`playChop/playTreeFall/playPickup`（Task 8）
- Produces: `class TreeInteractable implements Interactable`（prompt「Eで木を切る（あとN回）」）と `class LogPickup implements Interactable`（prompt「Eで薪を拾う」）
- 伐倒: chop() が 'felled' を返したら木の Group を 1.2 秒で 90 度回転（quaternion slerp）して地面へ、その位置に薪メッシュ（Cylinder 0.12x0.8）を3本スポーンし LogPickup として登録。拾うと `addLogs(1)` して消える。斧の見た目は画面右下に簡易メッシュ（Box+Cylinder）を固定表示し、E 押下で振りアニメ（0.3秒）
- [ ] **Step 1: 実装 → 手動確認**（木を4回叩く→倒れる→薪3本拾える→トレイのカウント増）→ build/test グリーン → Commit — `feat: tree chopping and log pickups`

### Task 12: Fire（焚き火）

**Files:**
- Create: `src/systems/Fire.ts`
- Modify: `src/main.ts`、`src/audio/synths.ts`（createFireCrackle 追加）

**Interfaces:**
- Consumes: `GameState.feedFire / fireIntensity / on('fire-changed')`
- Produces: `class Fire { constructor(scene, gs, audio); readonly interactable: Interactable; update(dt, playerPos): void; readonly position: THREE.Vector3 /* 原点(0, h, 0) */ }`
- 見た目: 石の輪（Torus か Sphere 8個）+ 薪組（Box 数本）+ 炎（加算合成の Sprite 2〜3枚を intensity でスケール・ちらつき）+ PointLight（色 0xff8844、intensity = 2 + fireIntensity * 6、ゆらぎに `Math.sin(t*13)*0.3`）+ 火の粉パーティクル（THREE.Points、上昇+消滅、レートは intensity 比例）
- `createFireCrackle(ctx)`: ランダム間隔のインパルス（バンドパスノイズバースト 30〜80ms）、setIntensity でレートとゲイン変化。距離減衰は main ループで `clamp(1 - dist/25, 0, 1)`
- prompt: 薪あり「Eで薪をくべる」/なし「薪がない。木を切ろう」（canInteract=false 側の誘導は Task 10 の flashMessage 経由）
- [ ] **Step 1: 実装 → 手動確認**（薪をくべると炎・光・パチパチ音が育つ。夜に火の存在感が出る）→ Commit — `feat: campfire that grows with fuel`

### Task 13: Water と Cooking（水汲みとコーヒー）

**Files:**
- Create: `src/systems/Water.ts`, `src/systems/Cooking.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Terrain.isInRiver`、`GameState.fillKettle / putKettleOnFire / drinkCoffee / brewProgress / kettle`、`Fire.position`、`playWaterFill / playSip`
- Produces:
  - `class WaterZone implements Interactable`（object は川辺の見えない Box。プレイヤーが川から3m以内で「Eで水を汲む」。kettle が 'empty' 以外なら canInteract=false）
  - `class Cooking { readonly fireKettleInteractable: Interactable; update(dt): void }`
    'filled' で焚き火に E →ケトルメッシュ（Cylinder+持ち手 Torus 半分）を火の上に表示、湯気パーティクル。'ready' になったら HUD.flashMessage(「コーヒーができた」) と soft なチャイム音。'ready' で E →座りシーケンス: カメラ y を 1.6→0.9 に 1 秒で補間・移動入力を 8 秒ロック・`playSip` を 2 回・湯気 Sprite を視界下部に表示 → 終了後 kettle='empty' で立ち上がる
- [ ] **Step 1: 実装 → 手動確認**（川で汲む→火にかける→30秒→完成通知→座って飲む、の全連鎖）→ Commit — `feat: water fetching and coffee brewing sequence`

### Task 14: 統合仕上げと受け入れ確認

**Files:**
- Create: `README.md`
- Modify: `src/ui/Title.ts`（操作説明: WASD 移動 / マウス 視点 / E アクション を開始画面に記載）、`handoff.md`

- [ ] **Step 1: 受け入れチェックリストを全部通す（ブラウザ手動）**
  1. タイトル→クリックで森に入り環境音が立ち上がる
  2. WASD+マウスで起伏を歩ける、川に近づくと川音が増す
  3. 木を切る→薪3本→拾える
  4. 焚き火に薪→炎・光・音が育つ
  5. 川で水汲み→焚き火にかける→30秒→「コーヒーができた」→座って飲める
  6. 昼夜が移ろい、夜は星と虫の声、焚き火の存在感が増す
  7. `npm run build && npm run test` グリーン、60fps 近辺
- [ ] **Step 2: README.md**（概要・操作・`npm install && npm run dev`・アーキテクチャ図はspec参照の1行）
- [ ] **Step 3: handoff.md 更新 → Commit** — `docs: readme and phase 2 completion`

---

## Phase 3（本計画のスコープ外・別計画を作成すること）

SnowTheme（色・フォグ・降雪パーティクル・音差し替え＋環境選択UI）、夜の蛍パーティクル、
タイトル画面の仕上げ、音響強化（PannerNode化・リバーブ）、モバイル対応検討。Phase 2 完了後に superpowers:writing-plans で
`docs/superpowers/plans/` に新規計画を作成する。仕様は spec 7章・theme 設計に準拠。

## 実行体制（引き継ぎセッションへの指示)

- 実装サブエージェントは **Sonnet 5**（Agent tool の `model: "sonnet"`）を使う
- タスク間レビュー: superpowers:subagent-driven-development の二段レビューに従う。
  Phase 完了時の重要レビューは **Opus 4.8**（`/model claude-opus-4-8` または model: "opus"）
- コミット前に `/review-diff`（Codex CLI）があれば併用（グローバル CLAUDE.md 参照）
- ビジュアル調整（色・フォグ・炎の見え方）は数値いじりの反復になるので、1タスク内でスクリーン
  ショットを撮って自己確認しながら進めてよい
