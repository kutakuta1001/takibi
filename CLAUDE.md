# CLAUDE.md — Takibi（キャンプ体験ウェブアプリ）

## プロジェクト概要

ブラウザで森・雪山のキャンプ体験ができる 3D 一人称ウェブアプリ。建築ゲームではなく
「キャンプをした実感」（歩く・木を切る・焚き火・水汲み・コーヒー）が目的。
セッション開始時はまず `handoff.md` を読むこと。

## 正典ドキュメント（優先順）

1. `docs/superpowers/specs/2026-07-07-camp-experience-design.md` — 設計書（体験仕様・音響設計・スコープ外リスト）
2. `docs/superpowers/plans/2026-07-07-camp-experience-plan.md` — 実施計画（Phase 0〜2 のタスクとテスト）
3. `ROADMAP.md` — フェーズ構成と受け入れ条件

## 技術ルール

- Vanilla Three.js + TypeScript + Vite。React・物理エンジン・ポストプロセスは導入しない
- dependencies は three / simplex-noise / alea のみ。追加は CEO 承認必須
- 外部3Dアセット・音声ファイルは使わない（手続き生成・手続き合成）。品質不足で CC0 素材に
  切り替えたい場合は CEO に提案してから
- ワールド生成は seed 固定（alea('takibi')）で決定的に
- GameState.ts は Three.js 非依存を厳守（単体テスト対象）
- 色・霧・木などの環境パラメータは必ず Theme 経由（`src/theme/`）。雪山対応の生命線
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
