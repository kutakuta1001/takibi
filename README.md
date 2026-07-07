# Takibi

ブラウザで森のキャンプ体験ができる3D一人称ウェブアプリ。歩く・木を切る・焚き火を育てる・
水を汲む・コーヒーを淹れて飲む——行動が軽く連鎖する達成感を音と情景で味わう。
建築・クラフトを楽しむゲームではなく、ノルマや失敗演出のない体験アプリ。

## セットアップ

```
npm install
npm run dev
```

`http://localhost:5173` を開き、タイトル画面をクリックして開始する。

## 操作

- WASD: 移動
- マウス: 視点（クリックでポインターロック取得、Escで解除）
- E: 見ている対象に対してアクション（木を切る・薪を拾う・薪をくべる・水を汲む・
  ケトルを火にかける・座ってコーヒーを飲む）

## スクリプト

- `npm run dev`: 開発サーバー起動
- `npm run build`: 型チェック（tsc --noEmit）+ 本番ビルド
- `npm run test`: Vitest によるユニットテスト実行

## アーキテクチャ

Vanilla Three.js + TypeScript + Vite。GameState（Three.js非依存の純ロジック）を中心に
systems が状態を書き換え、world/audio がイベント購読で反応する一方向データフロー。
詳細設計は `docs/superpowers/specs/2026-07-07-camp-experience-design.md` の3章を参照。

## 技術スタック

three / simplex-noise / alea（seed付き決定的生成）、TypeScript、Vite、Vitest。
