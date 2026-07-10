# handoff.md

## 現在地（2026-07-10）

Phase U「居る感（presence）磨き」完了（Task U1〜U5）。CEO 実機（イヤホン推奨）確認待ち。

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

1. CEO 実機（イヤホン推奨）確認: `npm run dev` → 3スポット周遊で残響差・突風・白い息・
   足音の先行到着・無操作時のUI消灯を体感確認
2. 公開: 社内向け・ホスティング先選定と公開実行は CEO 確認事項（Phase U 以前から未着手）

正典: `docs/superpowers/specs/2026-07-07-panorama-experience-design.md`（設計書）、
`docs/superpowers/plans/2026-07-10-presence-polish-plan.md`（Phase U 計画・U1〜U5）、`ROADMAP.md`。
