# CLAUDE.md — Takibi（キャンプ体験ウェブアプリ）

## プロジェクト概要

ブラウザで森・雪山のキャンプ体験ができるウェブアプリ。実写360°パノラマ（固定視点・
マウスで見回しのみ・移動なし）の中で「キャンプをした実感」（木を切る・焚き火・水汲み・
コーヒー）を音とともに味わう。建築ゲームではない。
セッション開始時はまず `handoff.md` を読むこと。

## 正典ドキュメント（優先順）

1. `docs/superpowers/specs/2026-07-07-panorama-experience-design.md` — v2 設計書（現行の正）
2. `docs/superpowers/plans/2026-07-07-panorama-pivot-plan.md` — パノラマ転換計画（Task P1〜P7）
3. `ROADMAP.md` — フェーズ構成と受け入れ条件
4. v1（3D歩行版）の設計書・計画は経緯資料。実装は `archive/3d-walkable` ブランチに保全

## 技術ルール

- Vanilla Three.js + TypeScript + Vite。React・物理エンジン・ポストプロセスは導入しない
- dependencies は three / simplex-noise / alea のみ。追加は CEO 承認必須
- 映像は実写360°パノラマ（equirectangular・トーンマップ済み 4K JPG・`public/panos/`・
  3枚合計35MB以下）。ライセンスは CC0 が第一候補、世界観に合う CC0 が無ければ CC BY / CC BY-SA も可
  （その場合 `ATTRIBUTION.md` への出典記録 + アプリ内クレジット表記で帰属表示。CC BY-SA は
  画像とコードを分離）。ソースは Poly Haven / ambientCG（CC0）と Wikimedia Commons（CC BY-SA）。
  前景3D（焚き火等）のテクスチャは `public/textures/` の CC0 素材。Google マップ等の
  規約制限のある画像は使わない
- 移動機能は実装しない（見回し + スポット遷移のみ）。PointerLock は使わない
- 音は手続き合成のまま（CEO 高評価点）。CC0 音源への切り替えは CEO に提案してから
- GameState.ts は Three.js 非依存を厳守（単体テスト対象）。audio/synths.ts は既存関数の
  アルゴリズム変更禁止（新規音源の追加・後段エフェクトの追加は可。2026-07-10 Phase U で緩和）
- ゲーミフィケーション（実績・カウンター・報酬・進捗バー等）は追加しない。
  「効果として気づかれたら強すぎる」は**雰囲気の演出（音・揺らぎ・光）にのみ適用**し、
  **行動の入り口（いまどこか・どこで何ができるか）は迷いなく見えることを優先**する
  （2026-07-11 更新: CEO が公開版で「何ができるかわからない」と迷った実体験が根拠）
- 雪山対応はパノラマ写真セット + 音ミックスの差し替えで行う（Spot / audioMix 設計を崩さない）
- 常時グリーン: `npm run build` / `npm run test`（Vitest）

## 実行体制

- 実装: Sonnet 5 サブエージェント（Agent tool で `model: "sonnet"`）+
  superpowers:subagent-driven-development
- レビュー: Phase 完了時に Opus 4.8。コミット前に /review-diff（Codex）併用可
- Phase 3 着手前に superpowers:writing-plans で新規計画を作成すること（計画未作成）

## 体験の判断基準（迷ったらこれ）

- ゲームではなく体験。数値ノルマ・失敗演出・警告UIは足さない
- 誘導はプロンプト文言で静かに行う（例:「薪がない。木を切ろう」）
- 音は体験の半分。機能追加時は必ず対応する音を検討する
