# パノラマ画像の出典

すべて [Poly Haven](https://polyhaven.com) の CC0（パブリックドメイン相当・帰属表示不要）HDRI。
配布元の「トーンマップ済み JPG」（8192x4096）を `sips` で 4096x2048 にリサイズし、
`public/panos/` に保存している。

## campsite.jpg

- 元アセット: [Forest Slope](https://polyhaven.com/a/forest_slope)（Poly Haven ID: `forest_slope`）
- 作者: Andreas Mischok
- ライセンス: CC0
- 選定理由（Phase S・2026-07-08差し替え）: CEO指摘「公園に見える・建物が写っている」を受けて
  je_gray_02 から差し替え。鬱蒼とした針葉樹の古木・苔むした岩・人工物ゼロで「隔絶された、
  探検の到達点」に見える。木々の間の開けた地面（もとは踏み跡状の空間だが舗装・標識等の
  人工物はなし）が焚き火を置ける平地として使える。campsite スポットのベース写真として採用
  （夕⇔夜グレーディングのベースは本画像の色調）

## riverside.jpg

- 元アセット: [Xanderklinge](https://polyhaven.com/a/xanderklinge)（Poly Haven ID: `xanderklinge`）
- 作者: Andreas Mischok
- ライセンス: CC0
- 選定理由（Phase S・2026-07-08差し替え）: CEO指摘「水面がほとんど写っていない」を受けて
  mossy_forest から差し替え。正面に小さな滝が落ち、手前に水音の立つ浅い流れが広がる渓谷の
  底で、「水がはっきり写っている」選定基準に合致。苔むした岩壁・倒木のみで人工物ゼロ。
  4096x2048全域を上（空・崖上）・中央・下（水面直下）の3帯に分けて拡大スキャンし、
  倒木に見えた斜線状の物体も樹皮・根株・つららの確認できる自然の倒木と判定（ロープ等ではない）。
  ゲーム内レンダリングでも360度スキャンして人工物なしを確認。riverside スポット
  （水汲み）のベース写真として採用

## snowfield.jpg

- 元アセット: [Snowy Forest](https://polyhaven.com/a/snowy_forest)（Poly Haven ID: `snowy_forest`）
- 作者: Andreas Mischok
- ライセンス: CC0
- 選定理由（Phase S・2026-07-08新規追加）: 設計原則「雪原・雪の稜線・人工物ゼロ・遠くに山並みが
  見える隔絶感」に基づき、Poly Haven の snow/winter/mountain 系タグ約150件のうち有望なもの
  （雪山の稜線・展望・スキー場等）を一通り確認したが、電線・電柱・建物・道路・ロープ・ベンチ・
  スキー跡・足跡のいずれかが必ず写り込んでおり「人工物ゼロ」を満たす稜線/展望系候補は
  見つからなかった（下記「比較検討したが採用しなかった候補」参照）。snowy_forest は
  遠景の山並みは写らないものの、鬱蒼とした針葉樹林の中に雪が積もり、地面の苔・切株・落枝のみで
  建物・道・足跡が一切なく「人工物ゼロ」を完全に満たす。4096x2048全域を上・中央・下の3帯×4分割で
  拡大スキャンして人工物なしを確認。雪山スポット（眺めと風音に浸る場所。体験ホットスポットなし）
  のベース写真として採用

## サイズ

- campsite.jpg: 約4.3MB
- riverside.jpg: 約3.3MB
- snowfield.jpg: 約4.5MB
- 合計: 約12.0MB（予算35MB以内）

## 比較検討したが採用しなかった候補

- campsite（Phase S・forest_slope採用時の比較）: niederwihl_forest（伐採した薪の山が写り込み
  管理された林に見える）/ felsenlabyrinth・phalzer_forest_01（岩塊は迫力があるが焚き火を置ける
  平地が乏しい）/ misty_pines（霧で視界が煙り情景が伝わりにくい）/ herkulessaulen（岩壁主体で
  森の地面が写らない）/ gum_trees（疎林で公園的に見える）/ shady_patch・green_sanctuary
  （手入れされた公園・庭園に見え、CEOの指摘した「公園に見える」問題を再現するため不採用）
- campsite（Phase P・je_gray_02採用時の比較。参考）: forest_grove / sunset_forest /
  nature_reserve_forest / dark_autumn_forest / autumn_forest_04
- riverside（Phase P・mossy_forest採用時の比較。参考）: stream / river_rocks / xanderklinge /
  monbachtal_riverbank / whipple_creek_gazebo
- riverside（Phase S・xanderklinge採用時の比較）: blue_grotto（渓谷全体は良好だが、ゲーム内
  レンダリングを拡大確認したところ谷を横断するロープ／ケーブルが見つかり不採用）/
  crystal_falls（滝は魅力的だが岩の上に置かれたバックパックが写り込み人の存在を示すため不採用）/
  lago_disola（湖面は美しいが拡大確認でコンクリート製の堰と小屋のような構造物が判明し不採用）
- snowfield（Phase S・snowy_forest採用時の比較）: snow_field / snow_field_2（電柱・電線・
  多数の足跡がある雪の農地で不採用）/ bergen（電線が写り込み、遠景にフィヨルド沿いの町も見えるため
  不採用）/ passendorf・passendorf_snow（雪原は美しいが林の際に建物のシルエットが確認できて不採用）/
  gamrig（砂岩の岩塊は迫力があるが雪がなく、岩場に手すり状のロープと整備された歩道があり不採用）/
  horn-koppe_snow（稜線の見晴らしは良いが拡大確認で地平線に小さな農家の建物群が見つかり不採用）/
  stierberg_sunrise（夕景は美しいが手前一面にスキー跡・足跡が広がり人の往来が明らかで不採用）/
  winter_lake_01（凍った湖の氷上に高層アパート群が地平線に並ぶ都市公園で不採用）/
  winter_evening（タグの時点で建物・街灯・柱と判明し確認不要で不採用）/
  snowy_hillside（タグにベンチがあり公園と判明し確認不要で不採用）/
  snowy_forest_path_01・snowy_forest_path_02（名称・タグ通り整備された遊歩道で不採用）
