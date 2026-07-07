# Takibi

ブラウザで森・川辺のキャンプ体験ができる実写360°パノラマのウェブアプリ。固定視点・
マウスで見回すだけで、木を切る・焚き火を育てる・水を汲む・コーヒーを淹れて飲む——
行動が軽く連鎖する達成感を音と情景で味わう。建築・クラフトを楽しむゲームではなく、
ノルマや失敗演出のない体験アプリ。

## セットアップ

```
npm install
npm run dev
```

`http://localhost:5173` を開き、タイトル画面をクリックして開始する。

## 操作

- マウスドラッグ: 見回す（慣性つき。PointerLockは使わない）
- クリック または E: 見ている対象に対してアクション（木を切る・薪をくべる・水を汲む・
  ケトルを火にかける・座ってコーヒーを飲む）
- 画面右下の「川辺へ →」/「キャンプ地へ →」ボタン: スポット間を移動する

## スクリプト

- `npm run dev`: 開発サーバー起動
- `npm run build`: 型チェック（tsc --noEmit）+ 本番ビルド
- `npm run test`: Vitest によるユニットテスト実行

## アーキテクチャ

Vanilla Three.js + TypeScript + Vite。GameState（Three.js非依存の純ロジック）を中心に、
pano/（パノラマ表示・見回し・スポット遷移・夕⇔夜グレーディング）と foreground/（焚き火・
伐採・水汲み〜コーヒーの前景3D）が状態を書き換え、audio がイベント購読で反応する
一方向データフロー。詳細設計は
`docs/superpowers/specs/2026-07-07-panorama-experience-design.md` を参照。

## 技術スタック

three / alea（seed付き決定的生成）、TypeScript、Vite、Vitest。
