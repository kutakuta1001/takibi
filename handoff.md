# handoff.md

## 現在地（2026-07-11）

Phase D「見つけやすさ（Discoverability）」Task 1〜4 完了（未push・親エージェントが検証後にpush予定）。
CEOが公開版で「どのシーンで何をやっているか・何ができるのかわからない」と迷った実体験を根拠に、
以下を追加した:
- Task 1: `ui/hints.ts`（純関数 nextHint・TDD・全10分岐テスト）+ `ui/AreaTitle.ts`（到着時に
  場所名+次の一歩を画面上部中央へ表示、ホールド3.5秒+ゆっくりフェードアウト1.5秒。IdleWatcher対象外）
- Task 2: `pano/HotspotMarker.ts`（暖色の柔らかい光スプライト・呼吸パルス周期3秒±10%・
  Canvas放射グラデ・AdditiveBlending）。伐採の木・焚き火（薪くべ）・ケトル・水汲み・座り場所2箇所に設置。
  表示条件はcanInteract||prompt非空、座り中は全消灯、IdleWatcher対象外。初回実装は白すぎ・小さすぎて
  木漏れ日と紛れたため、色を琥珀色寄りに彩度アップ+サイズ拡大（ANGULAR_SIZE 0.06→0.13）で調整
- Task 3: `ui/Help.ts`（H キー/HUD右下「?」ボタンで開閉、Esc/H/?で閉じる。操作方法+現在スポットの
  できること（動的）+体験の流れの紹介文。開いている間はlookControls/interactionを毎フレーム合成で停止）
- Task 4: Playwrightで初見シナリオを通し確認（開始→伐採→焚き火→水汲み→抽出→雪山へ運搬→山頂で
  一杯→静かに終わる）。全ステップ実際にクリック/キー操作で完走、pageerrorゼロ。idle消灯でナビ/音量/
  ヘルプボタンは消えるがマーカーは残ることも確認
- build / test 63件グリーン（既存52件+hints新規11件）
- 逸脱: HOTSPOT_DISTANCEをHotspot.tsからexport、directionToPosition/positionToDirectionを
  共通ヘルパーとして抽出（焚き火・ケトルの実座標からマーカー配置方向を逆算するため）。
  Interaction.tsにget target()を追加（マーカーのフォーカス判定用）。Cooking.tsにkettlePosition
  publicフィールドを追加。いずれも既存関数のロジックは変更せず、公開面の追加のみ

Phase E1「座る・飲む体験の統合（山頂の一杯）」Task 1〜4 完了（親エージェントが
検証後にpush予定）。Cooking の座りシーケンスを SitTimeline（純ロジック・TDD）+
SitSequence（演出・campsite/riverside/snowfield 共有の単一インスタンス）に切り出し、
riverside/snowfield に RestSpot（座って眺める）を追加。snowfield の RestSpot は
coffeeAware=true で「山頂の一杯」（campsite で淹れたコーヒーを座って飲める。完了通知・
チャイムなしで静かに終わる）に対応。Playwright通し確認（伐採→焚き火→水汲み→抽出→
飲まずに雪山へ→山頂で座って飲む→kettle empty→campsiteに戻り再抽出→campsiteでの
従来の座って飲むも両立）済み。build / test 52件グリーン（既存47件+SitTimeline新規5件）。
次は E2（第4スポット・写真先行調査）。

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

1. 親エージェントが Phase D の差分を検証後 push（`.github/workflows/deploy.yml` で自動デプロイ）
   → CEO に公開URLでの見つけやすさ改善（到着時のタイトルカード・光のマーカー・Hヘルプ）確認を依頼
   （https://kutakuta1001.github.io/takibi/ ）
2. 次フェーズ E2（第4スポット・写真先行調査）着手前に superpowers:writing-plans で新規計画を作成する
   （`docs/superpowers/plans/2026-07-11-e1-sit-and-summit-plan.md` は E1 で完了・経緯として保全）

正典: `docs/superpowers/specs/2026-07-07-panorama-experience-design.md`（設計書）、
`docs/superpowers/plans/2026-07-11-discoverability-plan.md`（Phase D計画・Task 1〜4）、
`docs/superpowers/plans/2026-07-11-e1-sit-and-summit-plan.md`（E1計画・Task 1〜4）、
`docs/superpowers/plans/2026-07-11-r0-r1-release-plan.md`（R0+R1計画・Task 1〜10）、
`docs/superpowers/plans/2026-07-10-presence-polish-plan.md`（Phase U 計画・U1〜U5）、`ROADMAP.md`。

2026-07-11: Phase D（見つけやすさ）を検証し push・デプロイ完了（テスト63件グリーン・公開URL 200）。本日分として改善ロードマップ策定（Codex と4往復・docs/superpowers/plans/2026-07-11-improvement-roadmap.md）→ R0/R1（GitHub Pages 公開: https://kutakuta1001.github.io/takibi/ ）→ E1（山頂の一杯）→ Phase D まですべて公開版に反映済み。次: CEO の公開版確認（マーカーの灯り具合・場所表示の感想）→ E2（第4スポット・写真先行調査）を writing-plans で計画。
