# Takibi Phase 2.5: ビジュアルリアリティ強化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CEO フィードバック「もう少しリアルな森・川に」に応え、CC0 写真テクスチャと絵作り強化（影・トーンマッピング・水面シェーダ）で実在感を上げる。

**Architecture:** ジオメトリは既存の手続き生成を維持し、マテリアルとライティングだけを強化する。
既存のクラス構造・インターフェース（Terrain.heightAt 等）は変更しない。テクスチャは
`public/textures/` に保存しリポジトリにコミットする（合計 20MB 以下を目安）。

**Tech Stack:** 既存スタックのみ（three / TypeScript / Vite）。新規 npm 依存は追加しない。

**前提:** Phase 2（Task 9〜14）完了後に着手。CEO 承認済みのルール変更（CC0 テクスチャ使用可）は
spec 2章と CLAUDE.md に反映済み。

## Global Constraints

- テクスチャは CC0 のみ（ambientCG または Poly Haven）。1K JPG を基本、地形のみ 2K 可
- ダウンロードした全アセットの出典 URL を `public/textures/ATTRIBUTION.md` に記録
- 影を落とすライトは太陽（DirectionalLight）1灯のみ。shadowMap は 2048 固定
- 各タスク完了時に `npm run build` / `npm run test` グリーン + DevTools で 60fps 近辺を確認
- 色 map は `texture.colorSpace = THREE.SRGBColorSpace`、normal/roughness はリニアのまま
- 昼夜サイクル（Sky.ts）との整合を壊さない（見た目確認は昼・夕・夜の3時点で行う）
- タスクごとにコミット（メッセージは各タスク末尾に記載）

---

### Task V1: レンダラ絵作り基盤（トーンマッピングと影）

**Files:**
- Modify: `src/core/Engine.ts`, `src/world/Sky.ts`, `src/world/Terrain.ts`, `src/world/Forest.ts`

- [ ] Engine: `renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;`
- [ ] Sky の太陽 DirectionalLight に `castShadow = true`、shadow.camera を ±40m 正方に設定し、
  毎フレーム target をプレイヤー位置へ追従（木漏れ日がプレイヤー周辺に常に出る）。
  shadow.bias は縞模様（shadow acne）が出ない値に調整（目安 -0.0005）
- [ ] Terrain.mesh: `receiveShadow = true`。Forest の幹・葉 InstancedMesh: `castShadow = true`（葉のみ receiveShadow も true）
- [ ] 手動確認: 昼に木の影が地面に落ち、太陽の移動で影が動く。fps 低下が 10% 以内
- [ ] Commit — `feat: tone mapping and sun shadows`

### Task V2: CC0 テクスチャパイプライン

**Files:**
- Create: `public/textures/ATTRIBUTION.md`, `src/core/textures.ts`
- Download: `public/textures/<name>/` 配下に color/normal/roughness の JPG

- [ ] ambientCG から次のカテゴリを 1K JPG で取得（URL 形式 `https://ambientcg.com/get?file=<ID>_1K-JPG.zip`。
  候補 ID が 404 の場合は ambientcg.com で同カテゴリの代替を選び、選定理由を報告に含める）:
  - 草地: 候補 `Grass001`（地形の基本面）
  - 森の地面（落ち葉・土）: 候補 `Ground037` または forest floor 系
  - 樹皮: 候補 `Bark012`
  - 岩: 候補 `Rock035`
  - 水面ノーマル: 候補 `Water002` の normal のみ（なければ Poly Haven の water 系）
- [ ] zip を展開し、必要な map（Color / NormalGL / Roughness）だけを
  `public/textures/grass/`, `ground/`, `bark/`, `rock/`, `water/` に配置。zip と不要 map は削除
- [ ] `src/core/textures.ts` を作成:

```ts
export interface PBRSet { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap?: THREE.Texture }
export function loadPBR(name: 'grass' | 'ground' | 'bark' | 'rock', repeat: number): PBRSet
// TextureLoader で読み、RepeatWrapping / repeat 設定 / anisotropy=8 / color map のみ SRGBColorSpace
export function loadWaterNormal(): THREE.Texture
```

- [ ] ATTRIBUTION.md に各アセットの ID・URL・ライセンス（CC0）を記録
- [ ] Commit — `feat: cc0 texture pipeline and assets`

### Task V3: 地形の実写質感

**Files:**
- Modify: `src/world/Terrain.ts`, `src/theme/Theme.ts`, `src/theme/ForestTheme.ts`

- [ ] Theme に `ground.textures?: { primary: string; secondary: string; repeat: number }` を追加し
  ForestTheme は `{ primary: 'grass', secondary: 'ground', repeat: 48 }`（約 4m ごとにタイル）
- [ ] Terrain のマテリアルを MeshStandardMaterial + loadPBR に置換。草（primary）と土（secondary）を
  ブレンドする: `material.onBeforeCompile` で simplex 由来の頂点属性 `aBlend`（0..1、生成時に
  `noise2D(x/15, z/15)` から計算し川岸ほど土寄り）を使い 2 セットの map/normal を mix する。
  シェーダ改変が過大なら、代替として頂点カラー + 2 枚目を別メッシュのデカール的パッチにする
  簡略案でもよい（見た目優先で判断し、採用した方式を報告）
- [ ] タイリングの繰り返し感対策: 同じ map を 1/7 スケールで二重サンプルして乗算（マクロバリエーション）
- [ ] 手動確認: 近景で草・土のディテール、遠景で繰り返し模様が目立たない、川岸が土になっている
- [ ] Commit — `feat: photo-textured terrain with grass-dirt blend`

### Task V4: 木の実写質感

**Files:**
- Modify: `src/world/Forest.ts`

- [ ] 幹 InstancedMesh: bark の PBRSet を適用（repeat 縦 2）。幹ジオメトリのセグメントを 8→12 に上げ、
  頂点をノイズでわずかに歪ませて円柱感を消す
- [ ] 葉: 色を per-instance で ±10% ばらつかせ（`setColorAt`）、roughness 0.9。コーンのままでも
  影とトーンマッピングで質感が出ることを確認し、不足なら葉テクスチャ + alphaTest 0.5 の
  クロスカード（板2枚交差）へ差し替える（fps を確認しながら判断・採用方式を報告）
- [ ] 手動確認: 幹に樹皮の凹凸感、森全体の色が単調でない、60fps 近辺維持
- [ ] Commit — `feat: photo-textured trees with variation`

### Task V5: 川の実写質感と岩

**Files:**
- Modify: `src/world/River.ts`（存在しない場合は Terrain 内の川面生成を `src/world/River.ts` に抽出）、`src/main.ts`

- [ ] 水面: MeshStandardMaterial ベースで `normalMap = loadWaterNormal()`、`onBeforeCompile` で
  UV を時間スクロール 2 系統（速度 0.03 と 0.017、方向を 30 度ずらす）合成し流れを表現。
  `transparent, opacity 0.85, roughness 0.1, metalness 0.0`。`scene.environment` に
  Sky と整合する PMREMGenerator 製の簡易環境（空グラデ）を設定してフレネル的な照り返しを出す
- [ ] 川底: 川面の下に rock テクスチャの帯メッシュを敷く（WATER_LEVEL - 0.4）
- [ ] 岸の岩: IcosahedronGeometry(detail 1) をランダムスケールで潰した岩を InstancedMesh 30 個、
  川縁（|x-30| が 4〜7m）に seed 配置（Alea('takibi-rocks')）、rock PBRSet + castShadow
- [ ] 手動確認: 水が「流れて」見える、照り返しがある、岩で川縁の直線感が消える
- [ ] Commit — `feat: flowing textured river with rocky banks`

### Task V6: 統合調整と受け入れ

**Files:**
- Modify: 調整対象のみ（fog 濃度・露出・ライト強度・Theme 値）

- [ ] 昼・夕（timeOfDay 0.45 付近）・夜の3時点でスクリーンショットを撮り、
  フォグ濃度 / toneMappingExposure / ライト強度を調整（夜が黒潰れしない・昼が白飛びしない）
- [ ] fps 確認（DevTools Performance で 55fps 以上）。不足時は shadowMap 1024 へ、
  木の count 削減ではなく描画側で調整する
- [ ] `npm run build && npm run test` グリーン確認
- [ ] handoff.md 更新 + Commit — `feat: visual integration pass for realism upgrade`
- [ ] CEO 受け入れ: ブラウザで「リアルになったか」を確認してもらう（Phase 2 の体験ループと合わせて）

---

## 実行体制

- 実装: Sonnet 5 サブエージェント（タスクごと）。ビジュアル調整はスクリーンショット自己確認しながら反復してよい
- テクスチャダウンロードは curl 等で行い、失敗時は代替 ID を選ぶ（作業を止めない）
- Phase 完了レビュー: Opus 4.8
