import * as THREE from 'three';
import Alea from 'alea';
import { Engine, EngineInitError } from './core/Engine';
import { Input } from './core/Input';
import { PauseGate } from './core/PauseGate';
import { Title } from './ui/Title';
import { Credits } from './ui/Credits';
import { HUD } from './ui/HUD';
import { AreaTitle } from './ui/AreaTitle';
import { Help } from './ui/Help';
import { StoryPanel } from './ui/StoryPanel';
import { IdleWatcher } from './ui/IdleWatcher';
import { VolumeControl } from './ui/VolumeControl';
import { DebugOverlay } from './ui/DebugOverlay';
import { PanoScene, SNOWFIELD_NIGHT_GRADING } from './pano/PanoScene';
import { LookControls } from './pano/LookControls';
import { SpotManager, type Spot } from './pano/SpotManager';
import { computeStarMaskFromImage, type Direction as SkyDirection } from './pano/StarMask';
import { Snowfall } from './pano/Snowfall';
import { Gusts } from './pano/Gusts';
import { Grading } from './pano/Grading';
import { GameState } from './systems/GameState';
import { SPOT_NAMES, type MarkerId, type SpotId, type StoryChoice, type StoryContext } from './story/scenario';
import { StoryEngine } from './story/StoryEngine';
import { Direction } from './story/Direction';
import { positionToDirection } from './pano/Hotspot';
import { HotspotMarker } from './pano/HotspotMarker';
import { Chopping } from './foreground/Chopping';
import { Fire } from './foreground/Fire';
import { Cooking } from './foreground/Cooking';
import { SitSequence } from './foreground/SitSequence';
import { RestSpot } from './foreground/RestSpot';
import { Breath } from './foreground/Breath';
import { AudioEngine } from './audio/AudioEngine';
import { createWind, createRiver, createBirds, createInsects } from './audio/synths';
import { Reverb, REVERB_PRESETS } from './audio/Reverb';
import { playFootsteps, type Ground } from './audio/footsteps';

const STAR_COUNT = 800;
const STAR_RADIUS = 45; // パノラマ球（半径50）の内側
const STAR_HIDE_DAYNESS = 0.25; // これ以上明るい間（夕方側）は星を完全非表示にする

/**
 * 夜空の星（v1 world/Sky.ts の buildStarPositions を移植）。上半球のみに均等分布させる。
 * どの方向が「空」かは写真ごとに異なるため、ここでは位置だけを均等分布で作り、
 * 実際にどの星を見せるか（頂点カラー）は各スポットのパノラマ読み込み後に
 * applyStarMaskForSpot が輝度ベースのマスク（StarMask.ts）で書き込む。
 * AdditiveBlending で加算合成するため、マスク値0=無加算=見えない、という扱いになる
 * （Fire.ts の火の粉パーティクルと同じ手法）。
 */
function buildStarField(): { points: THREE.Points; directions: SkyDirection[] } {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3); // 初期値0（マスク適用まで非表示のまま安全側に倒す）
  const directions: SkyDirection[] = [];
  const rand = Alea('takibi-stars');
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.abs(Math.cos(phi));
    const z = Math.sin(phi) * Math.sin(theta);
    directions.push({ x, y, z });
    positions[i * 3] = x * STAR_RADIUS;
    positions[i * 3 + 1] = y * STAR_RADIUS;
    positions[i * 3 + 2] = z * STAR_RADIUS;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    vertexColors: true,
    size: 1.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return { points: new THREE.Points(geometry, material), directions };
}

// campsite パノラマ内の実際の木の方向（yaw/pitch）。Phase S で forest_slope に差し替えた際、
// 太い一本の木の幹が視界正面やや左に来る向きへプレイテストで再調整済み。
const TREE_DIRECTION = { yaw: -0.33, pitch: -0.08 };

// 焚き火はカメラ（原点・目線高さ）から約2.5m先の地面。EYE_HEIGHTだけ下げて地面基準にする。
const EYE_HEIGHT = 1.6;
const FIRE_POSITION = new THREE.Vector3(0, -EYE_HEIGHT, -2.5);
// 座って飲む演出でLookControls.lookAtが向く先（焚き火の方向とほぼ同じ、やや浅め）。
const FIRE_LOOK_DIRECTION = { yaw: 0, pitch: -0.5 };

// riverside パノラマ内の水面の方向（yaw/pitch）。Phase S で xanderklinge に差し替えた際、
// 正面の小さな滝と手前の流れが同時に収まる向きへプレイテストで再調整済み。
const WATER_DIRECTION = { yaw: 0, pitch: -0.3 };

// riverside の「座って眺める」休憩スポット。滝の脇の苔むした岩場・倒木に座り、
// 正面の滝を眺める向きへ視線が動く（プレイテストで確定した方向）。
const RIVERSIDE_SEAT_DIRECTION = { yaw: 0.6, pitch: -0.45 };
const RIVERSIDE_VIEW_DIRECTION = { yaw: 0, pitch: -0.18 };

// snowfield の「座って眺める」休憩スポット（山頂の一杯の舞台）。山頂の岩稜に座り、
// 稜線と谷の展望を眺める向きへ視線が動く（プレイテストで確定した方向）。
const SNOWFIELD_SEAT_DIRECTION = { yaw: -1.2, pitch: -0.5 };
const SNOWFIELD_VIEW_DIRECTION = { yaw: -1.2, pitch: -0.15 };

const SPOT_LABELS: Record<Spot['id'], string> = {
  campsite: 'キャンプ地',
  riverside: '川辺',
  snowfield: '雪山',
};

// 足音の地面種別（旅する遷移: 出発地/到着地それぞれの足音に使う）。
const GROUND_BY_SPOT: Record<Spot['id'], Ground> = {
  campsite: 'grass',
  riverside: 'rock',
  snowfield: 'snow',
};
const TRANSITION_STEP_COUNT = 2;

// UIの消灯（Phase U）。無操作で所持品トレイが消え、世界だけが残る。
const IDLE_SECONDS = 8;

// public/ 配下の静的アセットは vite.config.ts の base（相対配信用 './'）の対象外のため、
// 先頭スラッシュ付きの絶対パス '/panos/...' だとサブパス配信（例: GitHub Pages の
// プロジェクトページ）でドメインルート起点に解決されてしまう。先頭スラッシュを外した
// 相対パスにすることで、常に index.html の配置場所を起点に解決させる。
const panoUrl = (file: string): string => `panos/${file}`;

// ハブ&スポーク構成: campsite が中心（両方へ直接行ける）、riverside/snowfield は
// campsite を経由しないと互いに行き来できない（SpotManager.transitionTo が destinations を強制）。
const SPOTS: Spot[] = [
  {
    id: 'campsite',
    panoUrl: panoUrl('campsite.jpg'),
    audioMix: { wind: 0.3, river: 0.08, birds: true, insects: true },
    snowfall: false,
    destinations: ['riverside', 'snowfield'],
  },
  {
    id: 'riverside',
    panoUrl: panoUrl('riverside.jpg'),
    // Phase S: xanderklingeは正面に小さな滝があり水量感が増したため river を微調整
    audioMix: { wind: 0.15, river: 0.65, birds: false, insects: true },
    snowfall: false,
    destinations: ['campsite'],
  },
  {
    id: 'snowfield',
    panoUrl: panoUrl('snowfield.jpg'),
    // 風が主役の静けさ。川も鳥も虫もいない雪山の孤独感を音でも表現する
    audioMix: { wind: 0.75, river: 0, birds: false, insects: false },
    snowfall: true,
    destinations: ['campsite'],
  },
];

const appContainer = document.getElementById('app');
if (!appContainer) {
  throw new Error('#app が見つかりません');
}
const uiRoot = document.getElementById('ui-root');
if (!uiRoot) {
  throw new Error('#ui-root が見つかりません');
}

/** WebGL が使えない環境向けの、可読な全画面フォールバック文言。 */
function showFatalMessage(root: HTMLElement, message: string): void {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.padding = '2rem';
  el.style.textAlign = 'center';
  el.style.background = '#000';
  el.style.color = '#fff';
  el.style.fontFamily = 'sans-serif';
  el.style.fontSize = '1.1rem';
  el.style.lineHeight = '1.8';
  el.textContent = message;
  root.appendChild(el);
}

let engine: Engine;
try {
  engine = new Engine(appContainer);
} catch (error) {
  if (error instanceof EngineInitError) {
    showFatalMessage(
      uiRoot,
      'お使いのブラウザでは 3D 表示（WebGL）を利用できませんでした。PC の Chrome / Edge / Firefox / Safari 最新版でお試しください'
    );
  }
  throw error;
}

// Engine.ts は他用途でも使うため無改修のまま、地形時代のプレースホルダー地面とフォグは
// このパノラマ体験には不要なのでここで取り除く（フォグは実写と馴染まず遠景を白飛びさせる）。
const placeholderGround = engine.scene.getObjectByName('placeholder-ground');
if (placeholderGround) {
  engine.scene.remove(placeholderGround);
}
engine.scene.fog = null;
// カメラはパノラマ球・Hotspot の方向ベクトルの原点である (0,0,0) に一致させる
// （ここをずらすと Hotspot の yaw/pitch が指した方向と実際に見える位置がずれてしまう）。
engine.camera.position.set(0, 0, 0);
// WebGLRenderer.render は scene 側のグラフしか走査しないため、camera.add() で付けた
// 斧ビューモデル等（camera の子）を描画させるには camera 自身を scene に入れる必要がある
// （v1 から潜在していた不具合。camera.parent===null のままだと子オブジェクトは常に非表示になる）。
engine.scene.add(engine.camera);

// 星の位置は写真に依存しないため先に作っておき、各スポットのパノラマ読み込み完了時に
// その写真の輝度から「空の方向だけ見せる」マスクを計算する（starMasks に spotごとキャッシュ）。
const stars = buildStarField();
engine.scene.add(stars.points);
const starMasks = new Map<Spot['id'], Float32Array>();

/** 現在のスポットの輝度マスクを星の頂点カラーへ書き込む（未計算なら安全側で全非表示）。 */
function applyStarMaskForSpot(spotId: Spot['id']): void {
  const mask = starMasks.get(spotId);
  const colorAttr = stars.points.geometry.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < STAR_COUNT; i++) {
    const value = mask ? mask[i] : 0;
    colorAttr.setXYZ(i, value, value, value);
  }
  colorAttr.needsUpdate = true;
}

// スポットごとに PanoScene を1つずつ用意し、可視状態の切替でクロスフェード先を表示する
// （テクスチャの再読込を避けるため、遷移のたびに作り直さない）。
const pmremGenerator = new THREE.PMREMGenerator(engine.renderer);
const panoScenes = new Map<Spot['id'], PanoScene>();
for (const spot of SPOTS) {
  const pano = new PanoScene(
    spot.panoUrl,
    (texture) => {
      if (spot.id === 'campsite') {
        // 焚き火の石・薪等の前景3Dを実写の色に馴染ませるため、campsite写真そのものを
        // 環境マップとして焼き込む（v1のような合成スカイシェーダは不要になった）。
        engine.scene.environment = pmremGenerator.fromEquirectangular(texture).texture;
        pmremGenerator.dispose();
      }
      // equirect画像を縮小Canvasへ描いて輝度サンプリングし、空(明るい)方向の星だけ見せる
      // マスクを作る（樹冠・岩は写真上で暗いため自然に除外される。詳細は StarMask.ts）。
      starMasks.set(spot.id, computeStarMaskFromImage(texture.image as CanvasImageSource, stars.directions));
    },
    // snowfield は元写真が非常に明るい雪面主体のため、forest系と同じ夜グレーディングでは
    // 「月夜」らしさが出ない（詳細は PanoScene.ts の SNOWFIELD_NIGHT_GRADING コメント参照）。
    spot.id === 'snowfield' ? SNOWFIELD_NIGHT_GRADING : undefined
  );
  pano.mesh.visible = spot.id === SPOTS[0].id;
  engine.scene.add(pano.mesh);
  panoScenes.set(spot.id, pano);
}

// campsite は起動時に先行ロードする（Title が load() を呼び、loading/ready/failed を表示する）。
// riverside/snowfield は初回遷移時に SpotManager の prepare フックで待つ。
const campsitePano = panoScenes.get(SPOTS[0].id)!;

const lookControls = new LookControls(engine.camera, engine.renderer.domElement);

const audio = new AudioEngine();

// スポットごとの空間感（残響）。dry(master)経路は変えず、環境音だけ並列でリバーブへ送る。
const reverb = new Reverb(audio.ctx);
audio.reverbSend.connect(reverb.input);
reverb.output.connect(audio.master);
reverb.apply(REVERB_PRESETS[SPOTS[0].id], 0); // 起動直後は即時反映（フェードなし）

const wind = createWind(audio.ctx);
wind.output.connect(audio.master);
wind.output.connect(audio.reverbSend);
const river = createRiver(audio.ctx);
river.output.connect(audio.master);
river.output.connect(audio.reverbSend);
const birds = createBirds(audio.ctx);
birds.output.connect(audio.master);
birds.output.connect(audio.reverbSend);
const insects = createInsects(audio.ctx);
insects.output.connect(audio.master);
insects.output.connect(audio.reverbSend);

// 足音専用バス。dry(master)とリバーブへ並列送信し、岩場（riverside）では他の環境音と
// 同じ空間感（残響）を足音にも乗せる。
const footstepsBus = audio.ctx.createGain();
footstepsBus.gain.value = 1;
footstepsBus.connect(audio.master);
footstepsBus.connect(audio.reverbSend);

// 環境音ミックスの「今向かっている先」。SpotManager.onApproach（暗転が深まった頃合い）で
// 目的地へ切り替え、onApply（クロスオーバー）でも保険として同期する。これにより
// 「姿より先に音が到着する」体験になる（実際の値はonUpdateで滑らかに追従させる）。
let ambientTargetSpot: Spot = SPOTS[0];
let ambientWindMix = SPOTS[0].audioMix.wind;
let ambientRiverMix = SPOTS[0].audioMix.river;
const AMBIENT_MIX_RESPONSE = 1.2; // 大きいほど新しいミックスへ速く追従する

function approachValue(current: number, target: number, dt: number): number {
  const t = 1 - Math.exp(-AMBIENT_MIX_RESPONSE * dt);
  return current + (target - current) * t;
}

/**
 * wind/river はスポットのミックスへ滑らかに追従した値（ambientWindMix/ambientRiverMix）を使う。
 * birds/insects は「そのスポットで鳴き得るか（Spot.audioMix の boolean）」と「今何時か
 * （Grading.dayness）」を組み合わせて毎フレーム決める（鳥は夕方側 dayness>0.4、虫は夜側
 * dayness<0.3 で createBirds/createInsects の閾値と噛み合う）。
 * wind は Gusts.strength（0..1、基礎風0.3前後を中心にゆっくり変動し時折突風）でも変調する
 * （campsite では同じ風音が葉ずれとしても機能するため、専用の合成は追加しない）。
 */
function applyAmbientAudio(dayness: number, gustStrength: number): void {
  wind.setIntensity(ambientWindMix * (0.7 + 0.6 * gustStrength));
  river.setIntensity(ambientRiverMix);
  birds.setIntensity(ambientTargetSpot.audioMix.birds ? dayness : 0);
  insects.setIntensity(ambientTargetSpot.audioMix.insects ? dayness : 1);
}

const gs = new GameState();
const hud = new HUD();
const areaTitle = new AreaTitle();
const volumeControl = new VolumeControl(audio.master);
const input = new Input();

function refreshInventory(): void {
  hud.setInventory(gs.logs, gs.kettle);
}
gs.on('logs-changed', refreshInventory);
gs.on('kettle-changed', refreshInventory);
refreshInventory();

const chopping = new Chopping(engine.camera, audio, gs);
const fire = new Fire(engine.scene, gs, audio, FIRE_POSITION);
// 座って眺める/飲む演出は campsite(Cooking)・riverside/snowfield(RestSpot) で共有する単一インスタンス
// （座りは同時に1つ。lookControls のロックもここに集約される）。
const sitSequence = new SitSequence(lookControls, engine.camera, audio);
const cooking = new Cooking(gs, audio, sitSequence, engine.scene, FIRE_POSITION, FIRE_LOOK_DIRECTION);
const riversideRest = new RestSpot(sitSequence, { lookDirection: RIVERSIDE_VIEW_DIRECTION });
// 山頂の一杯: campsite で淹れたコーヒー（kettle==='ready'はグローバル保持）をここで座って飲める。
// 完了通知・チャイムは出さない（静かに終わるのが正解。SitSequence.end は drinkCoffee() のみ呼ぶ）。
const snowfieldRest = new RestSpot(sitSequence, {
  lookDirection: SNOWFIELD_VIEW_DIRECTION,
  coffeeAware: true,
});

const storyEngine = new StoryEngine();
const storyPanel = new StoryPanel();

function currentCtx(): StoryContext {
  return {
    spot: spotManager.current,
    logs: gs.logs,
    kettle: gs.kettle,
    fireLit: gs.fireFuel > 0,
    treeFelled: chopping.felled,
  };
}

async function travel(to: SpotId): Promise<void> {
  const departureSpot = SPOTS.find((s) => s.id === spotManager.current);
  const wasBusy = spotManager.busy;
  const transition = spotManager.transitionTo(to);
  // 遷移が実際に始まった（busy が false→true になった）ときだけ出発地の足音を鳴らす
  if (!wasBusy && spotManager.busy && departureSpot) {
    playFootsteps(audio.ctx, footstepsBus, GROUND_BY_SPOT[departureSpot.id], TRANSITION_STEP_COUNT);
  }
  const result = await transition;
  if (result.status === 'failed') {
    hud.flashMessage('たどり着けなかった。通信を確認してもう一度');
    // onApproach で先行フェードしていた環境音ミックスを出発地へ巻き戻す
    if (departureSpot) {
      ambientTargetSpot = departureSpot;
    }
  }
}

const direction = new Direction({
  lookControls,
  gs,
  chopping,
  cooking,
  riversideRest,
  snowfieldRest,
  directions: {
    tree: TREE_DIRECTION,
    fire: FIRE_LOOK_DIRECTION,
    kettle: positionToDirection(cooking.kettlePosition).direction,
    water: WATER_DIRECTION,
  },
  travel,
});

let lastStoryKey = '';
function refreshStory(narration?: string): void {
  const view = storyEngine.view(currentCtx());
  const text = narration ?? view.text;
  const key = `${text}|${view.choices.map((c) => c.label).join('|')}`;
  if (key === lastStoryKey) return;
  lastStoryKey = key;
  storyPanel.show(text, view.choices.map((c) => c.label), (index) => {
    void chooseStory(view.choices[index]);
  });
}

async function chooseStory(choice: StoryChoice): Promise<void> {
  if (direction.busy || spotManager.busy || cooking.isSitting) return;
  storyPanel.setChoicesVisible(false);
  await direction.run(choice);
  storyPanel.setChoicesVisible(true);
  refreshStory(choice.narration);
}

gs.on('logs-changed', () => refreshStory());
gs.on('kettle-changed', () => refreshStory());

// インタラクト可能な場所に灯す、柔らかい光のマーカー（見つけやすさ）。伐採の木・水汲み・座り場所は
// Hotspot と同じ方向+既定距離（HOTSPOT_DISTANCE）に、焚き火の薪くべ・ケトルは実座標
// （FIRE_POSITION/cooking.kettlePosition）から方向+距離を逆算して同じ場所に光を置く。
const treeMarker = new HotspotMarker(engine.scene, TREE_DIRECTION);
const fireMarkerPlacement = positionToDirection(FIRE_POSITION);
const fireMarker = new HotspotMarker(engine.scene, fireMarkerPlacement.direction, fireMarkerPlacement.distance);
const kettleMarkerPlacement = positionToDirection(cooking.kettlePosition);
const kettleMarker = new HotspotMarker(engine.scene, kettleMarkerPlacement.direction, kettleMarkerPlacement.distance);
const waterMarker = new HotspotMarker(engine.scene, WATER_DIRECTION);
const riversideSeatMarker = new HotspotMarker(engine.scene, RIVERSIDE_SEAT_DIRECTION);
const snowfieldSeatMarker = new HotspotMarker(engine.scene, SNOWFIELD_SEAT_DIRECTION);

// マーカー1つぶんの設定（対応する選択肢の marker + どのスポットにいるときだけ判定するか）。
// 表示条件は、そのスポットにいて、いま出ている選択肢の中に同じ markerId を持つものがあるとき
// （main.ts の onUpdate が毎フレーム storyEngine.view(currentCtx()) から判定する）。
const markerBindings: Array<{ marker: HotspotMarker; spotId: SpotId; markerId: MarkerId }> = [
  { marker: treeMarker, spotId: 'campsite', markerId: 'tree' },
  { marker: fireMarker, spotId: 'campsite', markerId: 'fire' },
  { marker: kettleMarker, spotId: 'campsite', markerId: 'kettle' },
  { marker: waterMarker, spotId: 'riverside', markerId: 'water' },
  { marker: riversideSeatMarker, spotId: 'riverside', markerId: 'riversideSeat' },
  { marker: snowfieldSeatMarker, spotId: 'snowfield', markerId: 'snowfieldSeat' },
];

/** Help オーバーレイの「この場所でできること」。いま出ている選択肢のラベルをそのまま列挙する。 */
function currentSpotActions(): string[] {
  return storyEngine.view(currentCtx()).choices.map((choice) => choice.label);
}

/**
 * 伐採・焚き火・ケトルは campsite だけ、水汲みは riverside だけで有効にする。
 * riverside/snowfield には「座って眺める」休憩スポット（RestSpot）を置く（snowfield は
 * campsite で淹れたコーヒーを飲める「山頂の一杯」にもなる）。
 * 焚き火・斧・ケトルの3D表示自体を切り替える（これらは常にシーンに存在するため、
 * 切り替えないと別スポットに透けて見えてしまう）。
 */
function updateForegroundForSpot(spotId: Spot['id']): void {
  const atCampsite = spotId === 'campsite';

  chopping.setVisible(atCampsite);
  fire.setVisible(atCampsite);
  cooking.setVisible(atCampsite);
}
updateForegroundForSpot(SPOTS[0].id);

const grading = new Grading();
const snowfall = new Snowfall(engine.scene);
snowfall.setEnabled(SPOTS[0].snowfall);
const gusts = new Gusts();
const breath = new Breath(engine.scene, engine.camera);
breath.setEnabled(SPOTS[0].id === 'snowfield');

const spotManager = new SpotManager(
  SPOTS,
  (spot) => {
    for (const [id, pano] of panoScenes) {
      pano.mesh.visible = id === spot.id;
    }
    updateForegroundForSpot(spot.id);
    applyStarMaskForSpot(spot.id);
    snowfall.setEnabled(spot.snowfall);
    breath.setEnabled(spot.id === 'snowfield');
    reverb.apply(REVERB_PRESETS[spot.id]);
    ambientTargetSpot = spot; // 保険（通常は onApproach で既に切り替わっている）
    playFootsteps(audio.ctx, footstepsBus, GROUND_BY_SPOT[spot.id], TRANSITION_STEP_COUNT); // 到着地の足音
    refreshStory();
    areaTitle.show(SPOT_NAMES[spot.id]);
  },
  {
    onApproach: (target) => {
      // 姿より先に音が到着する: 暗転が深まった頃合いで到着地の環境音ミックスへ先行フェードインを始める
      ambientTargetSpot = target;
    },
    // riverside/snowfield は初回遷移時にここで読み込む（2回目以降は PanoScene.load() 側でキャッシュ済み）。
    prepare: (id) => panoScenes.get(id)!.load(),
  }
);

// ?debug=1 のときだけ表示するfps/レンダリング統計オーバーレイ（デフォルトはDOMを作らず無影響）。
const debugOverlay = new DebugOverlay(engine.renderer, () => SPOT_LABELS[spotManager.current]);

// H キー/右下「?」ボタンで開閉するヘルプ。開いている間の視点操作・選択肢操作の停止は
// engine.onUpdate 側で毎フレーム合成する（座り中との競合を避けるため、ここでは直接enabledを書かない）。
const help = new Help(
  () => SPOT_NAMES[spotManager.current],
  () => currentSpotActions()
);
hud.onHelpClick(() => help.toggle());
input.onKeyPress('KeyH', () => help.toggle());

// スポット遷移時の暗転（黒ではなく白寄りのやわらかい暗転）。
const fadeOverlay = document.createElement('div');
fadeOverlay.style.position = 'fixed';
fadeOverlay.style.inset = '0';
fadeOverlay.style.background = '#f2ece0';
fadeOverlay.style.opacity = '0';
fadeOverlay.style.pointerEvents = 'none';
uiRoot.appendChild(fadeOverlay);

// 無操作で所持品トレイが消え、世界だけが残る（StoryPanel は体験の入り口のため対象外）。
const idleWatcher = new IdleWatcher(IDLE_SECONDS);
idleWatcher.onChange((idle) => {
  hud.setIdle(idle);
  volumeControl.setIdle(idle);
});
window.addEventListener('mousemove', () => idleWatcher.activity());
window.addEventListener('keydown', () => idleWatcher.activity());
window.addEventListener('pointerdown', () => idleWatcher.activity());

// タブが裏に回っている間はシミュレーションと音を止める（薪の燃焼・抽出が裏で進み続けない
// ようにする）。GameState.ts 自体は変更せず、呼び出し側（この onUpdate）でゲートする。
const pauseGate = new PauseGate();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGate.paused = true;
    void audio.ctx.suspend();
  } else {
    pauseGate.paused = false;
    void audio.ctx.resume();
  }
});

let lastFireLit = false;

engine.onUpdate((dt) => {
  const gated = pauseGate.filter(dt);
  if (gated === null) return; // タブ非表示中: 更新も描画対象の状態変更も一切行わない
  dt = gated; // 復帰直後の1フレームだけ RESUME_DT_CLAMP に差し替えられている

  debugOverlay.recordFrame(dt);
  idleWatcher.update(dt);
  spotManager.update(dt);
  // スポット遷移中・座って飲む演出中・ヘルプが開いている間はユーザーのドラッグ見回しを止める
  // （lookControls.enabled の書き手が複数あるため、毎フレームここで合成する）。
  lookControls.enabled = !spotManager.busy && !cooking.isSitting && !help.isOpen;
  lookControls.update(dt);
  chopping.update(dt);
  gs.tick(dt);
  gusts.update(dt);
  snowfall.update(dt, gusts.strength);
  breath.update(dt);

  grading.update(dt);
  const dayness = grading.dayness;
  for (const pano of panoScenes.values()) {
    pano.setGrading(dayness);
  }
  fire.update(dt, dayness);
  cooking.update(dt);
  sitSequence.update(dt);

  const starVisible = dayness < STAR_HIDE_DAYNESS;
  stars.points.visible = starVisible;
  (stars.points.material as THREE.PointsMaterial).opacity = starVisible
    ? THREE.MathUtils.clamp(1 - dayness / STAR_HIDE_DAYNESS, 0, 1)
    : 0;

  ambientWindMix = approachValue(ambientWindMix, ambientTargetSpot.audioMix.wind, dt);
  ambientRiverMix = approachValue(ambientRiverMix, ambientTargetSpot.audioMix.river, dt);
  applyAmbientAudio(dayness, gusts.strength);

  fadeOverlay.style.opacity = String(spotManager.fadeOpacity);
  // 暗転が完了してもまだ遷移先の読み込みが終わっていない間、待たされている理由を示す。
  if (spotManager.pendingPrepare) {
    hud.flashMessage('向かっている…', 5);
  }

  // 火の消え際でも本文が追従するよう検出する（選択肢経由の変化は gs.on/chooseStory 側で対応済み）。
  const fireLitNow = gs.fireFuel > 0;
  if (fireLitNow !== lastFireLit) {
    lastFireLit = fireLitNow;
    refreshStory();
  }

  // 座り・スポット遷移・ヘルプ表示中はパネルごと静かに消す。
  storyPanel.setHidden(spotManager.busy || cooking.isSitting || help.isOpen);

  // マーカーは IdleWatcher の消灯対象外、座り中は全マーカー非表示。いま出ている選択肢が
  // 指す markerId のものだけ点灯する。
  const view = storyEngine.view(currentCtx());
  const currentSpotId = spotManager.current;
  for (const { marker, spotId, markerId } of markerBindings) {
    const lit =
      !cooking.isSitting && spotId === currentSpotId && view.choices.some((c) => c.marker === markerId);
    marker.setAvailable(lit);
    marker.update(dt, engine.camera);
  }
});

/**
 * 音のアンロックに失敗した場合（resume() が失敗、もしくは何らかの理由で状態が running に
 * ならなかった場合）、理由を示して次のクリック/キー入力で再試行する。
 */
function tryUnlockAudio(): void {
  void audio.unlock().then((unlocked) => {
    if (unlocked) return;
    hud.flashMessage('音を再生できませんでした。画面をクリックすると再試行します');
    const retry = () => {
      window.removeEventListener('click', retry);
      window.removeEventListener('keydown', retry);
      tryUnlockAudio();
    };
    window.addEventListener('click', retry, { once: true });
    window.addEventListener('keydown', retry, { once: true });
  });
}

const credits = new Credits();
const title = new Title(
  () => campsitePano.load(),
  () => {
    // campsite の読み込みは Title の loading/ready ゲートで既に完了している
    // （マスクも読み込み完了時のコールバックで計算済み）ので、開始スポットへ即時適用する。
    applyStarMaskForSpot(SPOTS[0].id);
    engine.start();
    areaTitle.show(SPOT_NAMES[SPOTS[0].id]);
    refreshStory();
    storyPanel.setHidden(false);
  },
  () => {
    tryUnlockAudio();
    // 炎動画の play() が自動再生制限で失敗している場合、確実なユーザー操作のこのタイミングで
    // 一度だけ再試行する（AudioEngine.unlock と同じ考え方）。
    fire.retryFlameVideo();
  },
  () => {
    credits.toggle();
  }
);
title.show();
