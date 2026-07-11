# Takibi Phase D: 見つけやすさ（Discoverability）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CEO フィードバック「どのシーンで何をやっているかわからない・何ができるのかわからない」に応える。場所の名前・次にできることの提示・インタラクト可能な場所の視覚マーカー・ヘルプを追加する。

**Architecture:** 既存 UI 層への追加。次の一歩を返す純関数 `nextHint`（テスト対象）を中心に、到着時タイトルカード・ホットスポットマーカー・ヘルプオーバーレイを実装。

**Tech Stack:** 既存のまま。npm 依存追加禁止。

## 設計原則の更新（本フェーズで確定）

従来の「効果として気づかれたら強すぎる」は**雰囲気の演出（音・揺らぎ・光）にのみ適用**する。
**行動の入り口（いまどこか・どこで何ができるか）は迷いなく見えることを優先する。**
実ユーザー（CEO）が迷った事実が根拠。ただしゲーミフィケーション禁止は維持
（目標・達成・報酬の UI にはしない。あくまで「案内」の言葉と印で示す）。

## Global Constraints

- 既存テスト52件 + 新規テストグリーン。各タスク完了時 `npm run build` / `npm run test`
- GameState.ts / audio/synths.ts 既存関数変更禁止
- タスクごとにコミット（記載メッセージ + 空行 + `Co-Authored-By: Claude <noreply@anthropic.com>`）
- **git push はしない**（親エージェントが検証後に push → 自動デプロイ）
- スクリーンショットは d-*.png としてスクラッチパッドへ。UI 文言は日本語・絵文字なし
- 文言のトーンは既存プロンプトと同じ「静かな誘い」（例:「木を切って薪を集めよう」。
  命令形の「せよ」や達成率・チェックリスト表示は使わない）

---

### Task 1: nextHint（純ロジック・TDD）と到着時タイトルカード

**Files:**
- Create: `src/ui/hints.ts`, `tests/hints.test.ts`, `src/ui/AreaTitle.ts`
- Modify: `src/main.ts`, `src/style.css`

**Interfaces:**
```ts
// hints.ts（純関数・GameState のゲッターのみ参照）
export const SPOT_NAMES: Record<SpotId, string> = {
  campsite: 'キャンプ地 - 深い原生林',
  riverside: '川辺 - 渓谷の滝',
  snowfield: '雪山 - 三千メートルの稜線',
};
export function nextHint(gs: GameState, spot: SpotId): string;
// campsite: 薪0&燃料0「木を切って薪を集めよう」/ 薪あり&燃料0「焚き火に薪をくべよう」/
//   燃料あり&kettle empty「川辺へ水を汲みに行こう」/ filled「ケトルを焚き火にかけよう」/
//   onFire「コーヒーができるまで火のそばで待とう」/ ready「焚き火のそばで飲もう。山頂まで持って行くのもいい」
// riverside: kettle empty「水を汲める場所がある。滝を眺めて座れる岩場も」/ その他「滝を眺めて座れる岩場がある」
// snowfield: ready「山頂で一杯を飲もう」/ その他「腰を下ろして稜線を眺めよう」
```
- AreaTitle: スポット到着時（開始直後・遷移完了時）に画面上部中央へ
  場所名（大きめ）+ nextHint の一行（小さめ）を表示し、5秒でゆっくりフェードアウト。
  IdleWatcher の消灯対象外（表示中はそのまま出し切る）
- [ ] **テスト先行**: nextHint の全分岐（campsite 6状態 + riverside 2 + snowfield 2）を
  失敗確認→実装
- [ ] AreaTitle 実装 + main.ts 接続（SpotManager.onApply と開始時に発火）
- [ ] スクリーンショット（3スポット到着直後）→ build/test → Commit — `feat: area title cards with next-step hints`

### Task 2: ホットスポットの視覚マーカー

**Files:**
- Create: `src/pano/HotspotMarker.ts`
- Modify: `src/main.ts`（各 Interactable/Hotspot にマーカー付与）, 必要なら `src/systems/Interaction.ts`

**Interfaces:**
```ts
export class HotspotMarker {
  constructor(scene: THREE.Scene, direction: HotspotDirection, distance?: number);
  setAvailable(on: boolean): void;  // canInteract 相当のときだけ表示
  setFocused(on: boolean): void;    // 視線が合いプロンプトが出ている間は控えめに（0.3倍の不透明度）
  update(dt: number, camera: THREE.Camera): void;  // ゆっくり呼吸するパルス（周期3秒・スケール±10%）
}
```
- 見た目: 柔らかい光の点（Canvas 放射グラデのスプライト・暖白色・小さめ）。
  ゲームの「!」マーカーではなく「そこに何かある」気配の光
- 対象: 伐採の木・焚き火（薪くべ）・ケトル（状態があるとき）・水汲み・座り場所（2箇所）。
  ナビボタンは既存 UI のまま
- 表示条件: その Interactable の canInteract が true か、prompt が非空のとき。
  座り中は全マーカー非表示。IdleWatcher の消灯対象外（マーカーは案内なので消さない）
- [ ] 実装 → 3スポットで表示確認（マーカーが写真に馴染みつつ視認できる）→
  スクリーンショット → build/test → Commit — `feat: soft light markers on interactable spots`

### Task 3: ヘルプオーバーレイ

**Files:**
- Create: `src/ui/Help.ts`
- Modify: `src/main.ts`, `src/ui/Title.ts`（開始画面に「H: ヘルプ」を追記）, `src/ui/HUD.ts`（右下に「?」ボタン）

- [ ] H キーまたは右下「?」ボタンで開閉する半透明オーバーレイ:
  1. 操作方法（マウスドラッグ: 見回す / E またはクリック: 行動 / H: このヘルプ）
  2. この場所でできること（現在スポットのホットスポット一覧を動的に列挙）
  3. 体験の流れの短い紹介文（「木を切り、火を育て、水を汲んで一杯のコーヒーを淹れる。
     出来たての一杯は山頂まで持って行ける」— 文章で。チェックリスト形式にしない）
- [ ] 開いている間は視点操作を止める。Esc / H / ? で閉じる。キーボードで完結すること
- [ ] スクリーンショット → build/test → Commit — `feat: help overlay with controls and spot actions`

### Task 4: 統合確認

**Files:**
- Modify: `handoff.md`

- [ ] 通し確認: 初見ユーザーの視点で「開始→タイトルカードで場所と次の一歩がわかる→
  マーカーで木と焚き火の位置がわかる→体験連鎖を最後まで迷わず進める」ことをシナリオ確認。
  座り中・遷移中にマーカーやカードが邪魔をしないこと
- [ ] 既存機能の回帰（体験連鎖・山頂の一杯・音量・idle 消灯 = ナビは消えるがマーカーは残る）
- [ ] handoff.md 更新 → build/test → Commit — `feat: discoverability integration pass`

---

## 実行体制

- 実装: Sonnet 5 サブエージェント（タスクごとコミット・push 禁止）
- 完了後: 親エージェント検証 → CLAUDE.md の判断基準更新 → push（自動デプロイ）→ CEO 確認依頼
