# Takibi E1: 座る・飲む体験の統合（山頂の一杯）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cooking に閉じている座りシーケンスを汎用化し、riverside / snowfield に「座って眺める」を追加。campsite で淹れたコーヒーを雪山山頂で飲める「山頂の一杯」を実現する。

**Architecture:** 純ロジックの SitTimeline（テスト対象）+ 演出をまとめる SitSequence を新設し、Cooking は SitSequence の利用者にリファクタリング（挙動不変）。新スポットの座り場所は Hotspot として追加。GameState は無改修（kettle の 'ready' はグローバル保持・drinkCoffee() の意味論を流用）。

**Tech Stack:** 既存のまま。npm 依存追加禁止。

## Global Constraints

- ゲーミフィケーション禁止（実績・メッセージ過多を足さない。山頂の一杯に完了通知は不要 —
  行為そのものが報酬）・「効果として気づかれたら強すぎる」
- GameState.ts 無改修（必要が生じたら停止して親に報告）。audio/synths.ts 既存関数変更禁止
- 既存テスト47件 + 新規テストすべてグリーン。各タスク完了時 `npm run build` / `npm run test`
- Cooking の既存挙動（campsite で座って飲む）は見た目・タイミング完全維持（回帰確認必須）
- タスクごとにコミット（記載メッセージ + 空行 + `Co-Authored-By: Claude <noreply@anthropic.com>`）
- **git push はしない**（親エージェントが検証後に push → 自動デプロイ）
- スクリーンショットは e1-*.png としてスクラッチパッドへ。UI 文言は日本語・絵文字なし

---

### Task 1: SitTimeline（純ロジック・TDD）

**Files:**
- Create: `src/foreground/SitTimeline.ts`, `tests/sittimeline.test.ts`

**Interfaces:**
```ts
export type SitEvent = 'sip' | 'standup' | 'end';
export class SitTimeline {
  constructor(opts: { durationSeconds?: number /* 既定8 */; withSips: boolean });
  update(dt: number): SitEvent[];   // この dt で新たに発生したイベントを返す（順序保証）
  get active(): boolean;            // end 後 false
}
// withSips=true のとき 2.5s と 5s に 'sip'。duration-1s に 'standup'、duration で 'end'
```

- [ ] **テスト先行**（失敗確認→実装）: (1) withSips=true で 0→8s を刻むと sip,sip,standup,end が
  この順で1回ずつ (2) withSips=false では sip が出ない (3) 大きな dt（例 10）でも全イベントが
  漏れず順序どおり1回ずつ返る (4) end 後 active=false・update は空配列
- [ ] Commit — `feat: sit timeline state machine (TDD)`

### Task 2: SitSequence 抽出と Cooking のリファクタリング

**Files:**
- Create: `src/foreground/SitSequence.ts`
- Modify: `src/foreground/Cooking.ts`, `src/main.ts`

**Interfaces:**
```ts
export class SitSequence {
  constructor(
    lookControls: LookControls,
    interaction: Interaction,
    camera: THREE.Camera,      // viewSteam スプライトの親
    audio: AudioEngine
  );
  start(opts: {
    lookDirection: HotspotDirection;   // 座って視線が向かう先
    durationSeconds?: number;
    coffee?: GameState;                // 指定時: sip音×2 + 画面下部の湯気 + 終了時 drinkCoffee()
  }): void;                            // active 中の start は無視
  get active(): boolean;
  update(dt: number): void;
}
```
- 現 Cooking の startSitSequence/updateSitSequence/endSitSequence・viewSteam・
  saved yaw/pitch 復帰・interaction/lookControls のロックを SitSequence へ移動
  （createSteamTexture も移動）。中身は SitTimeline を駆動する
- Cooking: `startSitSequence()` を `this.sitSequence.start({ lookDirection: this.fireLookDirection, coffee: this.gs })`
  に置換。`isSitting` は `sitSequence.active` へ委譲（main.ts の合成ロジックは無改修で動くこと）。
  SitSequence は main.ts で1つ生成し Cooking に注入（座りは同時に1つ）
- [ ] 実装 → 既存テスト47+新規グリーン → **回帰確認**: campsite でコーヒー完走
  （座る→sip2回→湯気→立ち上がる→kettle empty）のスクリーンショット e1-regression-*.png
- [ ] Commit — `refactor: extract reusable sit sequence from cooking`

### Task 3: riverside / snowfield の「座って眺める」

**Files:**
- Create: `src/foreground/RestSpot.ts`
- Modify: `src/main.ts`

**Interfaces:**
```ts
export class RestSpot {
  readonly hotspot: Hotspot;
  constructor(
    scene: THREE.Scene,
    sitSequence: SitSequence,
    opts: {
      hotspotDirection: HotspotDirection;  // 座れる場所（岩・倒木など写真内の自然な座り場）
      angularRadius: number;
      lookDirection: HotspotDirection;     // 座って眺める先（滝・稜線）
      promptText?: string;                 // 既定「Eで座って眺める」
      coffeeAware?: boolean;               // Task 4 で snowfield のみ true
    }
  );
}
```
- prompt: 通常は「Eで座って眺める」。coffeeAware かつ kettle==='ready' なら「Eで座って一杯を飲む」
- interact: `sitSequence.start({ lookDirection, coffee: coffeeAware && kettle==='ready' ? gs : undefined })`
- 配置（写真を見て自然な場所に微調整してよい）:
  - riverside: 滝を正面に眺められる岩場方向にホットスポット、lookDirection は滝
  - snowfield: 山頂の岩場方向、lookDirection は雪稜の展望
- main.ts: 各 RestSpot はそのスポット滞在中のみ interaction に登録（既存の水汲みホットスポットの
  スポット別管理と同じ作法に従う）
- [ ] 実装 → 手動確認（両スポットで座る→8秒眺める→戻る。報酬・通知なし）→
  スクリーンショット e1-rest-riverside.png / e1-rest-snowfield.png → build/test → Commit — `feat: rest spots for quiet sitting at riverside and snowfield`

### Task 4: 山頂の一杯と通し確認

**Files:**
- Modify: `src/main.ts`（snowfield の RestSpot を coffeeAware に）

- [ ] snowfield の RestSpot を `coffeeAware: true` にする。座って飲むとき:
  sip 2回 + 画面下部の湯気（寒い雪山では白い息 Breath と湯気が共存してよい）+ 終了時に
  kettle が 'empty' へ。**完了メッセージ・チャイムは出さない**（静かに終わる）
- [ ] **通し確認**（本計画の受け入れ基準）: campsite で伐採→焚き火→川辺で水汲み→戻って抽出→
  「コーヒーができた」→**飲まずに雪山へ**→雪山の岩場で「Eで座って一杯を飲む」→
  雪稜を眺めながら sip→終了後 kettle empty・HUD トレイ反映→campsite に戻り再度淹れられる。
  あわせて campsite での従来の「焚き火前で飲む」も引き続き動くこと（両立確認）
- [ ] スクリーンショット e1-summit-coffee-*.png（雪山で座って飲む瞬間・夕/夜どちらか）
- [ ] handoff.md 更新（E1 完了・E2 が次） → build/test → Commit — `feat: summit coffee at the snowfield rest spot`

---

## 実行体制

- 実装: Sonnet 5 サブエージェント（タスクごとコミット・push 禁止）
- 完了後: 親エージェントが検証 → push（自動デプロイ）→ CEO に公開 URL での確認を依頼
