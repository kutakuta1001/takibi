# Takibi Phase U: 「居る感」磨き（Presence Polish）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to実装 this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「キャンプや秘境に来ている感」を最優先で高める。音の空間感・世界の生きた揺らぎ・旅する遷移・UI の消灯の4本柱。

**Architecture:** 既存構造（pano/ + foreground/ + audio/ + ui/）への追加が中心。
audio/synths.ts の既存合成アルゴリズムは変更せず、後段（リバーブ）と新規音源（足音・突風変調）を追加する。

**Tech Stack:** 既存のまま。npm 依存追加禁止。

## CEO 確定の方向性（2026-07-10）

- **「キャンプや秘境に来ている感」を最優先**
- タイトル画面の凝った没入演出は**不要**（現状の簡素なタイトル + クレジット導線を維持。本計画のスコープ外）
- 細かなゲーミフィケーション（実績・カウンター・報酬・進捗バー等）は**追加禁止**
- 体験連鎖（伐採→焚き火→コーヒー）は現状のまま維持

## 品質原則（全タスク共通）

**「効果」として気づかれたら強すぎる。** 揺らぎ・リバーブ・息・足音はすべて、意識すると
存在に気づくが、意識しないと「そこに居る」としか感じない強度に調整する。迷ったら弱く。

## Global Constraints

- GameState.ts 変更禁止。audio/synths.ts の**既存関数のアルゴリズム変更禁止**（新規関数の追加は可）。
  AudioEngine.ts は「リバーブ挿入点の追加」のみ可（既存 API・既存音の接続は壊さない）
- ゲームプレイ（ホットスポット・体験連鎖・スポット遷移の状態機械）を壊さない。既存テスト17件グリーン維持
- 各タスク完了時 `npm run build` / `npm run test` グリーン + タスクごとコミット
  （メッセージは各タスク記載 + 空行 + `Co-Authored-By: Claude <noreply@anthropic.com>`）
- スクリーンショット/録画確認は playwright 一時利用（package.json 無変更）。音は自動検証できないため、
  各音の実装では「無音でないこと」「ゲイン範囲」をコードレベルで確認し、聴感は CEO 実機確認に委ねる
- UI 文言は日本語・絵文字なし。ドキュメントは README.md / handoff.md（U5）以外変更しない

---

### Task U1: 音の空間感（スポット別リバーブ）

**Files:**
- Create: `src/audio/Reverb.ts`, `tests/reverb.test.ts`
- Modify: `src/audio/AudioEngine.ts`（挿入点のみ）, `src/main.ts`（スポット遷移時にプリセット切替）

**Interfaces:**
```ts
// 純関数（テスト対象）: ノイズ+指数減衰の手続き IR 生成
export function generateImpulseResponse(sampleRate: number, seconds: number, decay: number): Float32Array;
export interface ReverbPreset { seconds: number; decay: number; wet: number }
export const REVERB_PRESETS: Record<'campsite' | 'riverside' | 'snowfield', ReverbPreset>;
// campsite（原生林）: { seconds: 1.2, decay: 3.0, wet: 0.16 }  柔らかく短い残響
// riverside（渓谷）:  { seconds: 2.6, decay: 2.2, wet: 0.28 }  岩壁の反響が主役
// snowfield（雪山）:  { seconds: 0.5, decay: 5.0, wet: 0.05 }  雪の吸音・ほぼ無響の静寂
export class Reverb {
  constructor(ctx: AudioContext);
  readonly input: GainNode;    // ここに send する
  readonly output: GainNode;   // master へ接続
  apply(preset: ReverbPreset, fadeSeconds?: number): void;  // ConvolverNode の IR 差し替え + wet 補間
}
```
- AudioEngine には `reverbSend: GainNode`（master 直前の分岐点）を1つ追加するのみ。
  既存の環境音・SFX の出力を dry（従来どおり）+ send（リバーブへ）の並列接続にする
- スポット遷移（SpotManager の onApply）でプリセットをクロスフェード切替

- [ ] テスト先行: `generateImpulseResponse` の長さ・単調減衰・NaN なしを Vitest で
- [ ] 実装 → 接続 → コードレベル検証（各スポットで wet ゲインがプリセット値になること）
- [ ] build/test → Commit — `feat: per-spot procedural reverb for spatial presence`

### Task U2: 世界の生きた揺らぎ（突風・視点の呼吸・白い息）

**Files:**
- Create: `src/pano/Gusts.ts`, `src/foreground/Breath.ts`, `tests/gusts.test.ts`
- Modify: `src/pano/LookControls.ts`（idle sway）, `src/pano/Snowfall.ts`（風連動ドリフト）, `src/main.ts`

**Interfaces:**
```ts
export class Gusts {           // 風の突風サイクル（数十秒周期のゆっくりした強弱）
  constructor(seed?: string);
  update(dt: number): void;
  get strength(): number;      // 0..1（基礎風 0.3 前後を中心にゆっくり変動、突風時 0.8 超）
}
export class Breath {          // 雪山の白い息（視界下部にかすかな霧が周期的に現れて消える）
  constructor(scene: THREE.Scene, camera: THREE.Camera);
  setEnabled(on: boolean): void;   // snowfield のみ true
  update(dt: number): void;        // 約4秒周期・不透明度は最大 0.12 の控えめさ
}
```
- Gusts.strength を接続: 風シンセの setIntensity 変調（スポット別の基礎値 × (0.7 + 0.6×strength)）・
  Snowfall の横ドリフト・（campsite では）葉ずれとして風ゲインのみ変調
- LookControls に idle sway: 無操作時、呼吸周期（約4.5秒）で yaw/pitch に振幅 0.10〜0.15度の
  正弦揺らぎをゆっくりフェードイン。ドラッグ開始で即座にフェードアウト。酔い防止のため振幅厳守
- [ ] Gusts のテスト先行（strength が常に 0..1・時間発展で変動すること）→ 実装 → 接続
- [ ] build/test → スクリーンショット（雪山で降雪が風に流れる瞬間）→ Commit — `feat: wind gusts, idle breathing sway and cold breath`

### Task U3: 旅する遷移（足音と音の先行到着）

**Files:**
- Create: `src/audio/footsteps.ts`
- Modify: `src/pano/SpotManager.ts`（遷移時間 1.5→2.6 秒・音フック追加）, `src/main.ts`
- Test: `tests/spotmanager.test.ts`（遷移時間変更に追随）

**Interfaces:**
```ts
export type Ground = 'grass' | 'rock' | 'snow';
export function playFootsteps(ctx: AudioContext, dest: AudioNode, ground: Ground, steps: number): void;
// 合成方針: ノイズバースト列（歩幅間隔 0.55s±10%）。草=低域こもり(lowpass 500Hz)、
// 岩=硬いコツ(bandpass 1.2kHz + 短い減衰)、雪=圧雪のきゅっという音(highpass+短いノイズ2連)
```
- 遷移シーケンス: フェードアウト開始と同時に「出発地の地面」の足音2歩 →
  暗転中に「到着地の環境音」を先行フェードイン（姿より先に音が到着する）→
  フェードイン時に「到着地の地面」の足音2歩
- 地面対応: campsite=grass / riverside=rock / snowfield=snow
- [ ] 実装 → SpotManager テスト更新 → build/test → Commit — `feat: footstep transitions with early ambience arrival`

### Task U4: UI の消灯（無操作で世界だけが残る）

**Files:**
- Create: `src/ui/IdleWatcher.ts`, `tests/idlewatcher.test.ts`
- Modify: `src/ui/HUD.ts`

**Interfaces:**
```ts
export class IdleWatcher {     // DOM 非依存のロジック（テスト対象）
  constructor(idleSeconds: number);          // 8秒
  activity(): void;                          // 入力イベントで呼ぶ
  update(dt: number): void;
  get idle(): boolean;
  onChange(cb: (idle: boolean) => void): void;
}
```
- idle 時: 所持品トレイ・ナビボタンを opacity 0.0 へ 1.5 秒でフェード（DOM は残す）。
  マウス移動・キー入力で 0.3 秒で復帰
- **中央の文脈プロンプトは消さない**（体験の道標。ただし idle 中に対象を見ていないなら元々出ない）
- ナビボタンの常時視認性を一段下げる（通常時 opacity 0.7・ホバーで 1.0）
- [ ] IdleWatcher テスト先行 → 実装 → スクリーンショット（idle 前後）→ build/test → Commit — `feat: hud fades away when idle`

### Task U5: 統合と受け入れ

**Files:**
- Modify: `README.md`（変更点1行）, `handoff.md`

- [ ] 3スポット通し確認（遷移の足音とリバーブ切替・雪山の息と降雪ドリフト・idle での UI 消灯・
  体験連鎖の完走・既存テスト17件+新規テストのグリーン）
- [ ] 品質原則の自己点検: 各効果を一つずつ ON/OFF して「OFF にすると寂しいが ON でも気づかれない」
  強度になっているかを確認し、強すぎるものは数値を下げる（判断値を報告に含める）
- [ ] スクリーンショット一式（u5-*.png）→ handoff.md 更新 → Commit — `feat: presence polish integration`

---

## 実行体制

- 実装: Sonnet 5 サブエージェント（タスクごとコミット）。音の聴感確認は CEO 実機確認に委ねる前提で、
  コードレベルの検証（ゲイン値・接続・無音でないこと）を丁寧に報告する
- 完了後: 親エージェント検証 → CEO ブラウザ/イヤホン受け入れ → 次は公開（ホスティング）判断
