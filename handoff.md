# handoff.md

## 現在地（2026-07-11）

Phase R0（公開ゲート）+ Phase R1（公開体裁 + GitHub Pages 公開）完了。**公開済み**:
https://kutakuta1001.github.io/takibi/ （main への push で自動デプロイ。
`.github/workflows/deploy.yml` が npm ci → test → build → Pages デプロイを実行する）

R0/R1 完了内容（Task 1〜10 + 5.5、コミット順）:
- Task 1: PanoScene 非同期ロード化・SpotManager 遷移失敗状態（campsite先行ロード、
  riverside/snowfield は初回遷移時にprepareフックで待つ）
- Task 2: タイトルのローダー化（loading/ready/failed）+ 開始・再試行・クレジットの本物のbutton化
- Task 3: WebGLガード（EngineInitError）+ AudioEngine.unlock()のPromise<boolean>化
- Task 4: PauseGate（タブ非表示時にシミュレーション・音声を一時停止）
- Task 5: PC推奨ガード（タッチ主体+狭幅で注意文）+ 炎動画フォールバックのonerror整備
- Task 5.5: 遷移失敗時、onApproachで先行フェードしていた環境音ミックスを出発地へ巻き戻す
  修正（main.tsのボタンクリックハンドラ側で対応）。炎フォールバック（動画404時）を目視確認し
  火の粉レート・光をフォールバック時のみ1.3倍に補強
- Task 6: 音量スライダー（VolumeControl.ts、localStorage `takibi-volume`に保存・復元、
  IdleWatcher連動）
- Task 7: 星マスクの輝度ベース化（StarMask.ts、equirect画像を256x128に縮小しピクセル輝度で
  空の方向だけ表示。旧仰角ベースの近似は撤去）+ 斧の造形改善（テーパー柄+グリップ色変化、
  頭部を金属質(metalness0.8/roughness0.4)の楔形に）
- Task 8: fpsデバッグオーバーレイ（`?debug=1`時のみ、DebugOverlay.ts）
- Task 9: OGP・favicon・タイトル文言（favicon.svg手描き、og.jpg 1200x630 270KB、
  index.htmlにmeta description/og:*/twitter:card追加）
- Task 10: GitHubリポジトリ作成（`kutakuta1001/takibi`、ソースごと公開）・
  archive/3d-walkableブランチもpush・Pages workflow設定・デプロイ確認
- **Task 10検証中に発見・修正したバグ**: `src/core/textures.ts`のloadPBRが先頭スラッシュ付き
  絶対パス（`/textures/rock/...`）を使っており、GitHub Pagesのサブパス配信
  （`/takibi/`）で焚き火の石テクスチャが404していた（panoUrl/FLAME_VIDEO_URLと同じ
  問題）。相対パスに修正し再デプロイ・実URLで解消確認済み
- build / test 47件グリーン（Phase U時点35件+R0で4件+StarMaskテスト8件）

---

## Phase U「居る感（presence）磨き」（2026-07-10・経緯として保全）

完了:
- U1: スポット別プロシージャルリバーブ（campsite/riverside/snowfieldでwet/減衰が異なる。
  環境音のみdry+send並列接続、SFXは対象外）
- U2: 突風サイクル（Gusts、風シンセと雪ドリフトを変調）・無操作時の呼吸ゆらぎ（LookControls idle
  sway、振幅0.13度）・雪山の白い息（Breath、最大opacity 0.12）
- U3: 旅する遷移（footsteps.ts、地面別の足音）+ SpotManager遷移1.5→2.6秒・onApproachフックで
  到着地の環境音を暗転中に先行フェードイン
- U4: 無操作8秒でHUD所持品トレイ・ナビボタンがopacity 0へ1.5秒フェード（DOMは残す。中央プロンプ
  トは対象外）。ナビボタン常時視認性を0.7に下げ、ホバーで1.0
- U5: 3スポット通し確認・体験連鎖（伐採→焚き火→水汲み→抽出→座って飲む）完走をPlaywrightで実証。
  品質原則の自己点検でSnowfallの風ドリフトを線形→二乗スケーリングに調整（基礎風時に既存sway
  振幅と同程度になり気づかれやすすぎたため）
- build / test 35件グリーン（既存17件+新規18件）

既知の残課題（軽微、Phase Sから持ち越し）:
- snowfield の谷底遠景にごく小さく集落らしき陰影（3000m級山頂実写に自然に伴う遠景）
- 実機 GPU での fps 未計測（エージェント環境はソフトウェア描画。screenshot時のWebGL
  ReadPixelsが数秒レンダリングを止め、Engine.tsのDT_MAX=0.1capでシミュレーション時間が
  遅延することを確認。既存挙動でPhase Uでは変更していない）

## 次のアクション

1. CEO 実機・他デバイスでの公開URL確認: https://kutakuta1001.github.io/takibi/
   （イヤホン推奨。3スポット周遊で残響差・突風・白い息・足音の先行到着・無操作時のUI消灯・
   星空・音量スライダーを体感確認）
2. 以降は main への push で自動的に再デプロイされる（`.github/workflows/deploy.yml`）。
   新規タスクは `docs/superpowers/plans/2026-07-11-r0-r1-release-plan.md` 完了により
   未作成（次フェーズ着手前に superpowers:writing-plans で新規計画を作成すること）

正典: `docs/superpowers/specs/2026-07-07-panorama-experience-design.md`（設計書）、
`docs/superpowers/plans/2026-07-11-r0-r1-release-plan.md`（R0+R1計画・Task 1〜10）、
`docs/superpowers/plans/2026-07-10-presence-polish-plan.md`（Phase U 計画・U1〜U5）、`ROADMAP.md`。
