# Takibi パノラマ転換（v2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D歩行世界を実写360°パノラマ（固定視点・見回しのみ）に置き換え、体験連鎖（伐採→薪→焚き火→水汲み→コーヒー）と手続き合成音を維持したまま没入感を実写品質へ引き上げる。

**Architecture:** spec v2（`docs/superpowers/specs/2026-07-07-panorama-experience-design.md`）参照。
GameState / AudioEngine / synths / HUD / Title は無改修で維持。world/ 層を pano/ + foreground/ に置換。

**Tech Stack:** 既存のまま（three / TypeScript / Vite / Vitest）。npm 依存追加禁止。

## Global Constraints

- 旧版は `archive/3d-walkable` ブランチに保全済み。main 上で置き換える
- パノラマは Poly Haven の CC0 のみ。トーンマップ済み 4K JPG、`public/panos/` に保存、
  `public/panos/ATTRIBUTION.md` に出典記録。合計 30MB 以下
- GameState.ts・audio/synths.ts・AudioEngine.ts は変更しない（変更が必要になったら理由を報告して停止）
- 各タスク完了時 `npm run build` / `npm run test` グリーン + タスクごとにコミット
  （`Co-Authored-By: Claude <noreply@anthropic.com>` 付き）
- スクリーンショット自己確認は playwright 一時利用（package.json 変更禁止・確立済み手法）
- UI 文言は日本語・絵文字なし

---

### Task P1: パノラマ表示と見回し

**Files:**
- Create: `src/pano/PanoScene.ts`, `src/pano/LookControls.ts`, `public/panos/ATTRIBUTION.md`
- Modify: `src/main.ts`（旧 world 生成を一旦コメントアウトではなく削除し、campsite パノラマ表示に置換。
  旧 world ファイル自体の削除は P7 で行う）

**Interfaces:**
- `class PanoScene { constructor(url: string); readonly mesh: THREE.Mesh; setGrading(dayness: number): void }`
  （反転球 SphereGeometry(50, 64, 32)・texture.colorSpace = SRGB。setGrading は P6 まで no-op で可）
- `class LookControls { constructor(camera, domElement); update(dt): void; enabled: boolean;
  lookAt(yaw: number, pitch: number, seconds: number): Promise<void> /* P5 の視点演出用 */ }`
  ドラッグ見回し・慣性減衰・pitch ±80度 clamp・感度は v1 の 0.002 相当。PointerLock は使わない

- [ ] Poly Haven から夕方〜ゴールデンアワーの森パノラマ（開けた地面・人の視線高）と川辺パノラマの
  2枚を 4K トーンマップ JPG で取得・選定理由を記録。ATTRIBUTION.md 作成
- [ ] PanoScene / LookControls 実装。Title クリック → campsite パノラマ + 風音（既存 AudioEngine）
- [ ] スクリーンショット確認（見回しの水平線が歪んでいないこと）→ build/test → Commit — `feat: photo panorama scene with drag look controls`

### Task P2: スポット遷移

**Files:**
- Create: `src/pano/SpotManager.ts`, `tests/spotmanager.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
```ts
export interface Spot { id: 'campsite' | 'riverside'; panoUrl: string;
  audioMix: { wind: number; river: number; birds: boolean; insects: boolean } }
export class SpotManager {
  constructor(spots: Spot[], onApply: (spot: Spot) => void);
  get current(): Spot['id'];
  transitionTo(id: Spot['id']): Promise<void>;  // 1.5秒フェード（黒ではなく白寄りのやわらかい暗転）
  get busy(): boolean;                           // 遷移中は入力無効化に使う
}
```
- 遷移状態機械（idle → fadingOut → fadingIn → idle、busy 中の transitionTo は無視）を
  Vitest でテスト（DOM 非依存に実装: フェード進行は update(dt) 駆動にする）
- campsite: wind 0.3 / river 0.08 / birds 夕のみ。riverside: wind 0.15 / river 0.55
- 画面端の誘導 UI（HUD に「川辺へ →」テキストボタン。クリックで遷移）

- [ ] テスト先行（遷移状態機械）→ 実装 → build/test → Commit — `feat: spot transitions with audio mix`

### Task P3: ホットスポット・インタラクション移植

**Files:**
- Create: `src/pano/Hotspot.ts`
- Modify: `src/systems/Interaction.ts`（レイキャスト対象をホットスポット球に。中央固定でなくマウス位置
  レイキャストに変更・クリックでも E でも発動）、`src/main.ts`

**Interfaces:**
- `class Hotspot implements Interactable { constructor(direction: {yaw, pitch}, angularRadius: number,
  handlers: {...}) }` — パノラマ空間の方向に置いた不可視 Sphere を object として提供
- 既存 HUD の prompt / flashMessage / setInventory は無改修で流用

- [ ] 伐採ホットスポット（campsite の実際の木の方向に配置。E/クリック4回 → 伐倒音 → 薪+3。
  斧ビューモデルと振りアニメは v1 Chopping から移植）
- [ ] 動作確認（プロンプト表示→伐採→トレイ加算）→ build/test → Commit — `feat: hotspot interactions with chopping`

### Task P4: 前景3D合成（焚き火）

**Files:**
- Create: `src/foreground/Fire.ts`（v1 `src/systems/Fire.ts` から移植・改名）
- Modify: `src/main.ts`

- [ ] 焚き火をパノラマの地面位置（campsite 写真内の焚き火適地の方向・距離約2.5m）に配置。
  `scene.environment = PMREM(campsite パノラマ)` で実写の色を前景3Dに反映。
  接地に暗いラジアルグラデのデカール（擬似影 + 夜は火の光の照り返しを加算）
- [ ] 炎の表現比較: (a) v1 パーティクル炎移植 vs (b) CC0 実写炎動画ビルボード
  （Pixabay 等で CC0 実写炎ループを探す。見つからなければ (a) 一択でよい）。
  両方（または a のみ）のスクリーンショットを撮り、馴染む方を採用・比較画像のパスを報告
- [ ] 薪くべ・fuel 連動（炎スケール・光・クラックル音）が実写背景上で機能 → Commit — `feat: composited campfire in photo panorama`

### Task P5: 水汲みとコーヒー（体験連鎖の完成）

**Files:**
- Create: `src/foreground/Cooking.ts`（v1 から移植）
- Modify: `src/main.ts`

- [ ] riverside に水汲みホットスポット（水面の方向・水音 SFX は既存）
- [ ] ケトル・抽出・「コーヒーができた」通知・チャイムを移植
- [ ] 座って飲む演出: `LookControls.lookAt()` で視点がゆっくり下がり炎へ向く（v1 で見送った
  自動視点誘導。移動が無いため安全に実装可能）・すする音2回・湯気・終了後に視点操作を返す
- [ ] 全連鎖の通し確認（伐採→薪→焚き火→川辺へ→水汲み→戻る→火にかける→30秒→座って飲む）
  → build/test → Commit — `feat: water fetching and coffee sequence in panorama`

### Task P6: 夕⇔夜グレーディングと星

**Files:**
- Create: `src/pano/Grading.ts`, `tests/grading.test.ts`
- Modify: `src/pano/PanoScene.ts`（setGrading 実装: シェーダで露出・色温度・彩度を補間）、`src/main.ts`

- [ ] `class Grading { update(dt): void; get dayness(): number /* 1=夕(ベース写真のまま), 0=夜 */ }`
  10分周期の夕⇔夜ループ。dayness 計算をユニットテスト
- [ ] 夜: パノラマを露出 -2EV 相当 + 青方偏移 + 彩度 60% へ・星オーバーレイをフェードイン・
  焚き火光の存在感最大化。鳥/虫の切替は既存 dayness 連動を接続
- [ ] 夕・中間・夜の3点スクリーンショット確認（写真が不自然に破綻しない範囲に調整）→ Commit — `feat: dusk-night grading loop with stars`

### Task P7: 旧コード削除と統合仕上げ

**Files:**
- Delete: `src/core/PlayerController.ts`, `src/world/`（全部）, `src/systems/Chopping.ts` / `Fire.ts` /
  `Water.ts` / `Cooking.ts`（foreground/ へ移植済みの旧版）, `tests/terrain.test.ts`,
  `public/textures/` の bark / grass / ground（rock は焚き火で使うなら残す）
- Modify: `README.md`（操作: マウスドラッグで見回す・クリック/Eでアクション）、`handoff.md`

- [ ] 削除後に import エラーが無いこと・`npm run build` / `npm run test` グリーン
- [ ] 受け入れチェックリスト（人間確認待ちとして報告）:
  1. タイトル→クリックで実写の森 + 風音。マウスで見回せる
  2. 木を切る→薪→焚き火にくべると炎・光・音が育つ（実写に馴染んでいるか）
  3. 「川辺へ」→フェード遷移→川音が主役になる→水汲み→戻る
  4. コーヒー完成→座って飲む（視点が炎へゆっくり向く演出）
  5. 10分で夕⇔夜がループし、夜は星と虫の声と焚き火
  6. 実写パノラマの解像感（4Kで見回して破綻がないか）
- [ ] Commit — `feat: complete panorama pivot, remove walkable world`

---

## 実行体制

- 実装: Sonnet 5 サブエージェント（タスクごとコミット）。レビュー: Opus 4.8（完了後）
- パノラマ選定は品質の要。P1 で候補を複数ダウンロードして比較してよい（採用外は削除）
