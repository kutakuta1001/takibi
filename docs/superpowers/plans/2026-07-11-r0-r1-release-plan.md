# Takibi R0+R1: 公開ゲートと GitHub Pages 公開 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改善ロードマップの Phase R0（壊れず始まる・壊れた時に説明できる）と Phase R1（公開体裁 + GitHub Pages 公開）を実装し、社内に公開する。

**Architecture:** 既存構造への追加・堅牢化が中心。PanoScene を非同期ロード化して campsite のみ先行ロード、SpotManager に遷移失敗状態を追加。公開は GitHub 公開リポジトリ + GitHub Actions で Pages へ自動デプロイ。

**Tech Stack:** 既存のまま + GitHub Actions（actions/deploy-pages）。npm 依存追加禁止。

## CEO 確定事項（2026-07-11）

- 公開先: GitHub Pages（アカウント kutakuta1001・認証済み・repo/workflow スコープあり）
- **ソースごと公開リポジトリで公開**（dist のみ公開ではない。ソースのバックアップを兼ねる）
- LICENSE ファイルは置かない（閲覧可・著作権保持のデフォルト状態）

## Global Constraints

- 既存テスト35件グリーン維持 + 新規テスト追加。各タスク完了時 `npm run build` / `npm run test` グリーン
- GameState.ts のロジック変更禁止（呼び出し側の一時停止ゲートで対応）。audio/synths.ts の既存関数
  アルゴリズム変更禁止。AudioEngine.ts は本計画 Task 3 に限り unlock() の戻り値拡張を許可
- ゲーミフィケーション追加禁止・「効果として気づかれたら強すぎる」原則・UI 文言は日本語・絵文字なし
- タスクごとにコミット（記載メッセージ + 空行 + `Co-Authored-By: Claude <noreply@anthropic.com>`）
- スクリーンショットは playwright 一時利用（package.json 無変更）で r0-*.png / r1-*.png として
  スクラッチパッドへ
- Task 10 以外でネットワークへの公開・push は行わない

---

## Phase R0: 公開ゲート

### Task 1: PanoScene 非同期ロード化と SpotManager 遷移失敗状態

**Files:**
- Modify: `src/pano/PanoScene.ts`, `src/pano/SpotManager.ts`, `src/main.ts`
- Test: `tests/spotmanager.test.ts`（追加）

**Interfaces:**
```ts
// PanoScene: コンストラクタでの即ロードをやめる
export type PanoState = 'idle' | 'loading' | 'ready' | 'failed';
export class PanoScene {
  constructor(url: string /* 既存引数は維持 */);
  load(): Promise<void>;          // 冪等。二重呼び出しは同じ Promise を返す
  get state(): PanoState;
}
// SpotManager: 遷移前フック。失敗時は current 維持
export interface TransitionResult { status: 'done' | 'failed' | 'ignored' }
transitionTo(id: Spot['id']): Promise<TransitionResult>;
// コンストラクタ opts に prepare?: (id: Spot['id']) => Promise<void> を追加（後方互換）
```
- main.ts: campsite の PanoScene のみ起動時に生成+load。riverside/snowfield は初回遷移時に
  生成・load（SpotManager の prepare フックで待つ）。2回目以降はキャッシュ
- 遷移の暗転中に prepare 未完了なら HUD に「向かっている…」を表示し完了を待つ。
  prepare が reject したら: 暗転を解除して出発地に留まり、HUD.flashMessage
  「たどり着けなかった。通信を確認してもう一度」を表示。busy は解除する

- [ ] **テスト先行**（tests/spotmanager.test.ts に追加。失敗を確認してから実装）:

```ts
it('stays at current spot when target pano fails to load', async () => {
  const onApply = vi.fn();
  const sm = new SpotManager(spots, onApply, {
    prepare: (id) => id === 'riverside' ? Promise.reject(new Error('network')) : Promise.resolve(),
  });
  const result = await sm.transitionTo('riverside');
  expect(result.status).toBe('failed');
  expect(sm.current).toBe('campsite');
  expect(sm.busy).toBe(false);
});
```

- [ ] PanoScene / SpotManager / main.ts 実装 → 全テストグリーン
- [ ] Commit — `feat: lazy pano loading with transition failure recovery`

### Task 2: タイトルのローダー化とキーボード到達

**Files:**
- Modify: `src/ui/Title.ts`, `src/ui/Credits.ts`, `src/main.ts`, `src/style.css`

- [ ] Title を3状態にする: loading（「森を準備しています…」・開始不可）/ ready（開始ボタン活性）/
  failed（「読み込みに失敗しました」+ 再試行ボタン → campsite.load() を再実行）。
  main.ts が campsite の load() Promise を Title に接続する
- [ ] 開始・再試行・クレジットを本物の `<button>` にする（Enter/Space で発火・フォーカスリング表示・
  Tab 順序が 開始→クレジット）。クレジット画面は Esc で閉じられる
- [ ] スクリーンショット（loading/ready の2状態）→ build/test → Commit — `feat: title as loader with keyboard access`

### Task 3: WebGL ガードと音のアンロック確認

**Files:**
- Modify: `src/core/Engine.ts`, `src/audio/AudioEngine.ts`, `src/main.ts`

- [ ] Engine: WebGLRenderer 生成を try/catch。失敗時は例外を握りつぶさず
  `EngineInitError` を投げ、main.ts が捕捉して `#ui-root` に可読メッセージを表示:
  「お使いのブラウザでは 3D 表示（WebGL）を利用できませんでした。PC の Chrome / Edge /
  Firefox / Safari 最新版でお試しください」
- [ ] AudioEngine.unlock(): `Promise<boolean>` を返すよう拡張（resume() の成否を反映。
  既存の呼び出し箇所は await しなくても壊れないこと）。false の場合 main.ts は
  HUD.flashMessage「音を再生できませんでした。画面をクリックすると再試行します」を表示し、
  次のクリック/キー入力で再 unlock を試みる
- [ ] build/test → Commit — `feat: webgl fallback and audio unlock confirmation`

### Task 4: タブ非表示時の一時停止

**Files:**
- Create: `src/core/PauseGate.ts`, `tests/pausegate.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
```ts
export class PauseGate {
  paused: boolean;
  filter(dt: number): number | null;  // paused 中は null（呼び出し側は更新スキップ）。
                                      // resume 直後の初回 dt は 0.1 に clamp
}
```
- main.ts: `document.visibilitychange` で hidden→ paused=true + `audio.ctx.suspend()`、
  visible→ paused=false + resume。メインループは `const gated = pauseGate.filter(dt)` が
  null なら GameState.tick / Grading / Gusts / Snowfall / Fire 等の更新を全てスキップ
  （描画呼び出しもスキップしてよい）

- [ ] **テスト先行**（失敗確認→実装）:

```ts
it('returns null while paused and clamps the first dt after resume', () => {
  const gate = new PauseGate();
  gate.paused = true;
  expect(gate.filter(5)).toBeNull();
  gate.paused = false;
  expect(gate.filter(5)).toBe(0.1);   // 裏タブ中の巨大 dt を持ち込まない
  expect(gate.filter(0.016)).toBe(0.016);
});
```

- [ ] 実装 → 手動確認（タブを切り替えて戻っても燃料・抽出が進んでいない）→ Commit — `feat: pause simulation and audio when tab is hidden`

### Task 5: PC推奨ガードと炎動画の非ブロッキング化

**Files:**
- Modify: `src/ui/Title.ts`, `src/foreground/Fire.ts`, `src/main.ts`

- [ ] モバイル判定（`window.matchMedia('(pointer: coarse)')` かつ画面幅 < 900px）のとき、
  タイトルに注意文を追加表示: 「このアプリは PC ブラウザ推奨です。タッチでの視点操作には
  未対応です」+ それでも「開始する」は押せる（ブロックはしない）
- [ ] Fire.ts: 炎動画のロードを開始ブロッカーにしない（既に非同期なら onerror 整備のみ）。
  `video.onerror` / play() reject 時は炎ビルボードを非表示にし、薪・火の粉・光・クラックル音で
  焚き火が成立するフォールバックを確認。ユーザー操作時に一度だけ play() を再試行
- [ ] build/test → R0 通し確認（Task 14 チェックリスト相当の簡易版: タイトル→開始→3スポット→
  体験連鎖1周）→ Commit — `feat: pc-recommended guard and non-blocking flame video`

## Phase R1: 公開体裁と GitHub Pages 公開

### Task 6: 音量スライダー

**Files:**
- Create: `src/ui/VolumeControl.ts`
- Modify: `src/main.ts`, `src/style.css`

- [ ] 画面右下にスピーカーアイコン（テキスト「音量」でも可・控えめ）。クリックで横スライダー
  （0〜100）を展開。AudioEngine.master.gain を制御し、値は localStorage `takibi-volume` に保存・
  起動時復元。IdleWatcher の消灯対象に含める（無操作時は他の UI と一緒に消える）
- [ ] build/test → Commit — `feat: volume control with persistence`

### Task 7: 星マスクの輝度ベース化と斧の造形改善

**Files:**
- Modify: 星の実装モジュール（パノラマ転換後は `src/pano/` 配下にある。`grep -rn "星\|star" src/pano src/main.ts` で特定してから着手）, `src/foreground/Chopping.ts`（斧メッシュ）

- [ ] 星: スポットのパノラマ読み込み後に equirect 画像を縮小 Canvas（例 256x128）へ描き、
  各星の方向に対応するピクセル輝度をサンプル。**輝度が閾値以上（=空）の方向の星だけ表示**する
  事前マスクを生成（樹冠・岩は写真上で暗いため除外される）。仰角マスクは撤去または併用
- [ ] 斧: 柄を木色のわずかなテーパー付き円柱 + グリップ部の色変化、頭部を金属質
  （metalness 0.8 / roughness 0.4）の楔形に。画面内で「白い棒」に見えないこと
- [ ] スクリーンショット（夜の星・斧のアップ）→ build/test → Commit — `fix: luminance-based star mask and axe modelling`

### Task 8: fps デバッグオーバーレイ

**Files:**
- Create: `src/ui/DebugOverlay.ts`
- Modify: `src/main.ts`

- [ ] `location.search` に `debug=1` がある場合のみ有効。1秒ごとに更新する小型 DOM:
  avg fps / p95 frame time(ms) / worst frame(ms) / renderer.info.render.calls /
  renderer.info.memory.geometries+textures / 現在スポット。本番でも `?debug=1` で使える
- [ ] build/test → Commit — `feat: fps debug overlay behind query flag`

### Task 9: OGP・favicon・タイトル文言

**Files:**
- Create: `public/favicon.svg`, `public/og.png`
- Modify: `index.html`

- [ ] favicon.svg: 焚き火モチーフの簡素な手描き SVG（濃紺背景に橙の炎。外部素材不可）
- [ ] og.png: 既存スクリーンショット（docs/screenshots/ または撮り直し）から 1200x630 を
  `sips` で切り出し（夕暮れの焚き火が入った構図・300KB 以下に圧縮）
- [ ] index.html: `<html lang="ja">`・title「Takibi — 秘境で焚き火を囲む」・meta description・
  og:title / og:description / og:image / og:type=website / twitter:card=summary_large_image。
  og:url は Task 10 の公開 URL（https://kutakuta1001.github.io/takibi/）を先行記載
- [ ] build/test → Commit — `feat: ogp, favicon and page metadata`

### Task 10: GitHub リポジトリ作成と Pages デプロイ

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `README.md`, `handoff.md`

- [ ] deploy.yml: push(main) トリガー → actions/checkout → setup-node 20 → `npm ci` →
  `npm run test` → `npm run build` → actions/upload-pages-artifact（dist）→
  actions/deploy-pages。permissions: pages:write, id-token:write
- [ ] リポジトリ作成と push: `gh repo create kutakuta1001/takibi --public --source=. --remote=origin --push`
  → `git push origin archive/3d-walkable`（旧版もバックアップ）
- [ ] Pages を workflow ビルドに設定: `gh api repos/kutakuta1001/takibi/pages -X POST -f build_type=workflow`
  （既存なら PUT）→ Actions の完了を `gh run watch` で待つ
- [ ] 公開確認: `curl -sI https://kutakuta1001.github.io/takibi/` が 200、
  index.html / パノラマ1枚 / 炎動画 / favicon が取得できること
- [ ] README に公開 URL を追記・handoff.md 更新（公開済み・URL・運用 = main への push で自動デプロイ）
- [ ] Commit — `feat: github pages deployment workflow`

---

## 実行体制

- R0（Task 1〜5）→ 親エージェント検証 → R1（Task 6〜10）の順で Sonnet サブエージェントに依頼
- Task 10 は外部公開を伴う唯一のタスク（CEO 承認済み: ソースごと公開・GitHub Pages）。
  それ以外のタスクでは push しない
- 完了後: 公開 URL を CEO に報告し、実機・他デバイスからのアクセス確認を依頼する
