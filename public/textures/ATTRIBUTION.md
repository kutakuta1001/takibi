# テクスチャ出典

すべて CC0（パブリックドメイン相当・帰属表示不要）。ambientCG から 1K JPG で取得し、
Color / NormalGL / Roughness のみを抜粋して配置している（AmbientOcclusion / Displacement /
blend / usdc / mtlx / tres / png プレビューは未使用のため削除済み）。

| フォルダ | アセット ID | 用途 | 取得元 URL | ライセンス |
|---|---|---|---|---|
| `grass/` | Grass001 | 地形の基本面（草地） | https://ambientcg.com/get?file=Grass001_1K-JPG.zip | CC0 |
| `ground/` | Ground037 | 森の地面（落ち葉・土。川岸のブレンド用） | https://ambientcg.com/get?file=Ground037_1K-JPG.zip | CC0 |
| `bark/` | Bark012 | 木の幹 | https://ambientcg.com/get?file=Bark012_1K-JPG.zip | CC0 |
| `rock/` | Rock020 | 川岸の岩・川底 | https://ambientcg.com/get?file=Rock020_1K-JPG.zip | CC0 |

`rock/` は当初 `Rock035`（ambientCG のタグに `black` とある通り、実際はほぼ黒に近い
玄武岩/粘板岩調のテクスチャ）で取得したが、ゲーム内では岩が黒い塊のように見えてしまい
質感が読めなかったため、V5（川の実写質感）作業中に `Rock020`（タグ: `grey` `wet` `flat`。
苔混じりの明るいグレーの濡れた岩肌）へ差し替えた。

## 水面ノーマルマップについて（計画からの逸脱）

計画では「水面ノーマル: 候補 `Water002` の normal のみ（なければ Poly Haven の water 系）」
としていたが、`Water002` は ambientCG に存在せず（404）、`Water001`〜`Water006` も同様。
ambientCG API で `water` / `ripple` / `ocean` / `liquid` / `river` / `stream` を検索しても
流水表現に適した写真ベースのノーマルマップは見つからなかった（Foam系・Ice系はフォームや氷の
質感で川の流れには不適）。Poly Haven の texture カテゴリにも water 系アセットは存在しない
（`/api/v2/full_json` および `/api/categories/textures` で確認済み）。

そのため水面ノーマルマップは `src/core/textures.ts` の `loadWaterNormal()` 内で
canvas を用いて手続き生成する方式に変更した（既存コードの `Fire.ts` の炎グローテクスチャ・
`Cooking.ts` の湯気テクスチャと同じ手法）。CC0 写真テクスチャではなくなるが、コード生成の
ため出典表記は不要でありライセンス上の問題もない。

## サイズ

1K JPG × 4アセット（Color / NormalGL / Roughness）で合計約19.4MB（20MB 目安以内）。
地形は Global Constraints で「地形のみ 2K 可」とされていたが、1K の4アセットで既に
19.4MB を消費しており 2K へのアップグレードは予算を超えるため、全アセットを 1K に統一した
（計画からの逸脱・報告済み）。
