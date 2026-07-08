# Takibi Phase S: 写真差し替えと雪山スポット Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CEO フィードバックを反映する。(1) キャンプサイトを「深い原生林」の写真へ差し替え、(2) 川辺を「川が実際に写っている」写真へ差し替え、(3) 雪山スポットを追加する。あわせて静的配信の準備を行う。

**Architecture:** 既存の pano/ + foreground/ 構造（v2 設計書）を維持。写真差し替えはアセット置換 + ホットスポット方向・前景配置の再調整。雪山は Spot 追加 + 降雪パーティクル + 音ミックス。

**Tech Stack:** 既存のまま。npm 依存追加禁止。

## 写真選定の設計原則（CEO 確定・2026-07-08。全スポット共通）

**「自分では行けない場所へ連れて行く」。** 普通のキャンプ場には誰でも行けるが、深い原生林・
谷の底・雪山は一流の探検家しか行けない。写真は「気軽に行けそうな公園・遊歩道」ではなく
「隔絶された、探検の到達点」に見えるものを選ぶ。人工物（建物・塀・舗装・標識・電線）が
写り込んでいる写真は不採用。

## Global Constraints

- パノラマは Poly Haven の CC0・トーンマップ済み JPG を 4096x2048 に統一。`public/panos/`、
  `ATTRIBUTION.md` に出典と選定理由を記録。3枚合計 35MB 以下
- GameState.ts / audio/AudioEngine.ts / audio/synths.ts は変更禁止（風の強度は既存 setIntensity の
  範囲で制御）
- 各タスク完了時 `npm run build` / `npm run test` グリーン + タスクごとコミット
  （`Co-Authored-By: Claude <noreply@anthropic.com>` 付き）
- スクリーンショット自己確認（playwright 一時利用・package.json 無変更）を各タスクで実施し
  s1-*.png 〜 s4-*.png としてスクラッチパッドへ保存
- ドキュメントは README.md（S4）と handoff.md（S4）以外変更しない。UI 文言は日本語・絵文字なし

---

### Task S1: キャンプサイトを深い原生林へ差し替え

**Files:**
- Replace: `public/panos/campsite.jpg`
- Modify: `src/main.ts`（ホットスポット方向・焚き火/斧の配置角度の再調整のみ）、`public/panos/ATTRIBUTION.md`

- [ ] Poly Haven で「深い原生林」基準の候補を3枚以上比較（基準: 鬱蒼とした古い森・苔・
  人工物ゼロ・焚き火を置ける平地が視界内・視線高が人の立ち位置。カテゴリ forest / nature を探索）。
  採用1枚と比較スクリーンショット・選定理由を記録
- [ ] 焚き火・斧・伐採ホットスポットの方向を新写真の地形に合わせて再調整
  （焚き火は開けた地面、伐採対象は実際に木がある方向）
- [ ] 夕⇔夜グレーディングのベース値を新写真の色調に再調整（原生林は元が暗いため
  夜の露出低下量を写真に合わせて調整。黒潰れしないこと）
- [ ] スクリーンショット（夕・夜）→ build/test → Commit — `feat: replace campsite with deep primeval forest panorama`

### Task S2: 川辺を「川が写っている」写真へ差し替え

**Files:**
- Replace: `public/panos/riverside.jpg`
- Modify: `src/main.ts`（水汲みホットスポットの方向再調整）、`public/panos/ATTRIBUTION.md`

- [ ] CEO 指摘: 現行写真（渓流の小道）は川がほぼ写っていない。**水面がはっきり見える**
  川・渓流のパノラマへ差し替え（基準: 視線をやや下げると水面が大きく見える・流れが感じられる・
  人工物ゼロ・上記の設計原則）。候補比較と選定理由を記録
- [ ] 水汲みホットスポットを実際の水面の方向に配置。川音ミックスは既存値を流用し、
  写真の水量感に合わせて微調整可
- [ ] スクリーンショット（夕・夜）→ build/test → Commit — `feat: replace riverside with visible-water panorama`

### Task S3: 雪山スポットの追加

**Files:**
- Create: `public/panos/snowfield.jpg`, `src/pano/Snowfall.ts`
- Modify: `src/pano/SpotManager.ts`（Spot 型拡張）, `tests/spotmanager.test.ts`, `src/ui/HUD.ts`（ナビUI）, `src/main.ts`, `public/panos/ATTRIBUTION.md`

**Interfaces:**
```ts
// SpotManager の Spot 型を拡張（既存2スポットの定義も更新）
export interface Spot {
  id: 'campsite' | 'riverside' | 'snowfield';
  panoUrl: string;
  audioMix: { wind: number; river: number; birds: boolean; insects: boolean };
  snowfall: boolean;                       // snowfield のみ true
  destinations: Spot['id'][];              // ナビUIに出す遷移先
}
export class Snowfall {   // カメラ空間の降雪パーティクル（THREE.Points、ゆらぎ付き落下）
  constructor(scene: THREE.Scene);
  setEnabled(on: boolean): void;
  update(dt: number): void;
}
```
- スポット構成はハブ&スポーク: campsite の destinations = ['riverside', 'snowfield']、
  riverside / snowfield の destinations = ['campsite']。ナビボタンは複数表示に対応
  （「川辺へ」「雪山へ」「キャンプ地へ」）
- snowfield の audioMix: wind 0.75 / river 0 / birds false / insects false（風が主役の静けさ）
- 雪山パノラマ基準: 雪原または雪の稜線・人工物ゼロ・遠くに山並みが見える隔絶感（設計原則参照）
- 雪山では体験ホットスポットは置かない（眺めと音に浸る場所。コーヒー持参などの拡張は次フェーズ判断）

- [ ] SpotManager テストを3スポット構成（destinations 制約・busy 中無視）に拡張し、テスト先行で実装
- [ ] Snowfall 実装（降雪は snowfield でのみ有効。遷移フェードと干渉しないこと）
- [ ] 雪山の夜グレーディング（青白い月夜・星は既存仰角マスク流用）
- [ ] スクリーンショット（夕・夜・降雪が写っていること）→ build/test → Commit — `feat: add snowfield spot with snowfall and wind`

### Task S4: 統合と配信準備

**Files:**
- Modify: `vite.config.ts`（`base: './'` — dist をどの静的ホストに置いても動くように）、`README.md`、`handoff.md`

- [ ] 3スポットの通し確認（campsite→riverside→campsite→snowfield→campsite、遷移ごとの
  音の入れ替わり・降雪の on/off・体験連鎖が campsite で引き続き完走すること）
- [ ] `npm run build && npm run preview` で dist 動作確認（パノラマのパスが相対で解決されること）
- [ ] README に配信手順を追記: 「`npm run build` の dist/ を任意の静的ホスティング
  （GitHub Pages / Cloudflare Pages / 社内サーバー）に配置」。具体的なホスティング先の
  選定と実際の公開は CEO 確認事項として handoff に記載（勝手に公開しない）
- [ ] handoff.md 更新 → Commit — `feat: three-spot integration and static deploy readiness`

---

## 実行体制

- 実装: Sonnet 5 サブエージェント（タスクごとコミット）。写真選定は本フェーズの品質の8割を
  決めるため、S1/S2/S3 とも候補比較を必ず行い、比較画像を残す
- 完了後: 親エージェントがスクリーンショット検証 → CEO ブラウザ受け入れ → Opus 4.8 レビュー。
  次フェーズはタイトル画面などの UI/UX 磨き（CEO 確定の優先順位）
