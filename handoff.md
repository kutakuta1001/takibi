# handoff.md

## 現在地（2026-07-09）

実写360°パノラマ版 Takibi が3スポットで完成。CEO ブラウザ受け入れ確認待ち。

完了:
- 3スポット（campsite=深い原生林 / riverside=渓谷の滝・水面がはっきり写る / snowfield=Piz d'Err
  スイス3000m級の雪稜パノラマ）。ハブ&スポーク遷移（キャンプ地が基地）
- 体験連鎖（伐採→薪→焚き火→川辺で水汲み→戻って火にかける→座って飲む）+ 手続き合成音
- 夕⇔夜グレーディング（各スポット黒潰れなし）・降雪パーティクル（雪片化）・写真クレジット画面
- ライセンス: campsite/riverside=Poly Haven CC0、snowfield=Wikimedia CC BY-SA 4.0（帰属表示は
  ATTRIBUTION.md + アプリ内クレジット画面で充足。画像とコードは分離）
- 配信準備: `base: './'`・相対パス化済み（サブパス配信可）。旧3D歩行版は `archive/3d-walkable` に保全
- build / test（17件）グリーン。panos 合計 9.0MB

既知の残課題（軽微）:
- snowfield の谷底遠景にごく小さく集落らしき陰影（3000m級山頂実写に自然に伴う遠景。前景人工物では
  ないが CEO 確認事項）
- 実機 GPU での fps 未計測（エージェント環境はソフトウェア描画）
- 画面最上部の樹冠に星がわずかに残る（仰角マスク近似）・斧の造形は簡素

## 次のアクション

1. CEO ブラウザ受け入れ確認（`npm run dev` → 3スポット周遊・体験連鎖・実機fps・谷底遠景の許容可否）
2. 次フェーズ Phase U（UI/UX 磨き: タイトル/ナビ/HUD の質感・音響強化・モバイル検討）を
   writing-plans で計画（CEO 確定の優先順位）
3. 公開: 社内向け・作りやすい方法で。ホスティング先選定と公開実行は CEO 確認を経る

正典: `docs/superpowers/specs/2026-07-07-panorama-experience-design.md`（設計書）、
`docs/superpowers/plans/2026-07-08-snow-and-photos-plan.md`（Phase S 計画・S1〜S5）、`ROADMAP.md`。
