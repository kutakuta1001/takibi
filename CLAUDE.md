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
- 映像は CC0 実写360°パノラマ（Poly Haven、トーンマップ済み 4K JPG、`public/panos/` に保存・
  `ATTRIBUTION.md` に出典記録、合計30MB以下）。前景3D（焚き火等）のテクスチャは
  `public/textures/` の CC0 素材。Google マップ等の規約制限のある画像は使わない
- 移動機能は実装しない（見回し + スポット遷移のみ）。PointerLock は使わない
- 音は手続き合成のまま（CEO 高評価点）。CC0 音源への切り替えは CEO に提案してから
- GameState.ts は Three.js 非依存を厳守（単体テスト対象）。audio/synths.ts と合わせて
  v1 から無改修維持が原則
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
