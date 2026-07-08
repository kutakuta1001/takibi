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
- 画面右下の「川辺へ →」/「雪山へ →」/「キャンプ地へ →」ボタン: スポット間を移動する
  （ハブ&スポーク構成。キャンプ地から両方へ直接行けるが、川辺⇄雪山はキャンプ地を経由する）

## スクリプト

- `npm run dev`: 開発サーバー起動
- `npm run build`: 型チェック（tsc --noEmit）+ 本番ビルド
- `npm run preview`: `npm run build` の dist/ をローカルで配信確認（配信前の最終チェック用）
- `npm run test`: Vitest によるユニットテスト実行

## 配信手順

`npm run build` で生成される `dist/` は静的ファイルのみで構成されており、任意の静的ホスティング
（GitHub Pages / Cloudflare Pages / 社内サーバー等）にそのまま配置すれば動作する。
`vite.config.ts` の `base: './'` によりアセット参照が相対パス化されているため、ドメインの
サブパス（例: `https://example.com/takibi/`）に配置してもそのまま動く。

1. `npm run build` を実行し、`dist/` フォルダ一式をホスティング先にアップロードする。
2. `npm run preview` でローカル確認してから配置するとよい（相対パス解決の最終チェック）。

実際のホスティング先の選定・公開の実行は CEO 確認事項のため、本セッションでは行っていない
（`handoff.md` 参照）。

## アーキテクチャ

Vanilla Three.js + TypeScript + Vite。GameState（Three.js非依存の純ロジック）を中心に、
pano/（パノラマ表示・見回し・スポット遷移・夕⇔夜グレーディング）と foreground/（焚き火・
伐採・水汲み〜コーヒーの前景3D）が状態を書き換え、audio がイベント購読で反応する
一方向データフロー。詳細設計は
`docs/superpowers/specs/2026-07-07-panorama-experience-design.md` を参照。

## 技術スタック

three / alea（seed付き決定的生成）、TypeScript、Vite、Vitest。
