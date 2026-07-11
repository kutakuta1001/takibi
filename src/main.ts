import * as THREE from 'three';
import Alea from 'alea';
import { Engine, EngineInitError } from './core/Engine';
import { Input } from './core/Input';
import { Title } from './ui/Title';
import { Credits } from './ui/Credits';
import { HUD } from './ui/HUD';
import { IdleWatcher } from './ui/IdleWatcher';
import { PanoScene, SNOWFIELD_NIGHT_GRADING } from './pano/PanoScene';
import { LookControls } from './pano/LookControls';
import { SpotManager, type Spot } from './pano/SpotManager';
import { Snowfall } from './pano/Snowfall';
import { Gusts } from './pano/Gusts';
import { Grading } from './pano/Grading';
import { GameState } from './systems/GameState';
import { Interaction } from './systems/Interaction';
import { Chopping } from './foreground/Chopping';
import { Fire } from './foreground/Fire';
import { Cooking } from './foreground/Cooking';
import { Breath } from './foreground/Breath';
import { AudioEngine } from './audio/AudioEngine';
import { createWind, createRiver, createBirds, createInsects } from './audio/synths';
import { Reverb, REVERB_PRESETS } from './audio/Reverb';
import { playFootsteps, type Ground } from './audio/footsteps';

const STAR_COUNT = 800;
const STAR_RADIUS = 45; // パノラマ球（半径50）の内側
const STAR_HIDE_DAYNESS = 0.25; // これ以上明るい間（夕方側）は星を完全非表示にする
// 仰角が低い領域は実写の木々の樹冠にあたるため、星をフェードして木の上に浮いて見えないようにする。
const STAR_FADE_MIN_ELEVATION = THREE.MathUtils.degToRad(16); // これ未満は完全に隠す
const STAR_FADE_FULL_ELEVATION = THREE.MathUtils.degToRad(34); // これ以上で完全に見える

/**
 * 夜空の星（v1 world/Sky.ts の buildStarPositions を移植）。上半球のみに均等分布させる。
 * 各星の仰角から木々の樹冠に隠れるべき低仰角ほど暗くなるフェード係数を頂点カラーに焼き込み、
 * AdditiveBlending で加算合成する（値0=無加算=見えない）ことで、シェーダーを書かずに
 * 「空の高い領域だけ星が見える」馴染ませを実現する（Fire.ts の火の粉パーティクルと同じ手法）。
 * campsite/riverside で樹冠の高さが異なるため厳密な写真ベースのマスクではないが、
 * 低仰角の樹冠帯を一律にフェードすることで効果と実装コストのバランスを取った。
 */
function buildStarField(): THREE.Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const rand = Alea('takibi-stars');
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const x = STAR_RADIUS * Math.sin(phi) * Math.cos(theta);
    const y = Math.abs(STAR_RADIUS * Math.cos(phi));
    const z = STAR_RADIUS * Math.sin(phi) * Math.sin(theta);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const elevation = Math.asin(THREE.MathUtils.clamp(y / STAR_RADIUS, -1, 1));
    const fade = THREE.MathUtils.smoothstep(elevation, STAR_FADE_MIN_ELEVATION, STAR_FADE_FULL_ELEVATION);
    colors[i * 3] = fade;
    colors[i * 3 + 1] = fade;
    colors[i * 3 + 2] = fade;
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
  return new THREE.Points(geometry, material);
}

// campsite パノラマ内の実際の木の方向（yaw/pitch）。Phase S で forest_slope に差し替えた際、
// 太い一本の木の幹が視界正面やや左に来る向きへプレイテストで再調整済み。
const TREE_DIRECTION = { yaw: -0.33, pitch: -0.08 };
const TREE_ANGULAR_RADIUS = 0.08; // rad（約4.6度）

// 焚き火はカメラ（原点・目線高さ）から約2.5m先の地面。EYE_HEIGHTだけ下げて地面基準にする。
const EYE_HEIGHT = 1.6;
const FIRE_POSITION = new THREE.Vector3(0, -EYE_HEIGHT, -2.5);
// 座って飲む演出でLookControls.lookAtが向く先（焚き火の方向とほぼ同じ、やや浅め）。
const FIRE_LOOK_DIRECTION = { yaw: 0, pitch: -0.5 };

// riverside パノラマ内の水面の方向（yaw/pitch）。Phase S で xanderklinge に差し替えた際、
// 正面の小さな滝と手前の流れが同時に収まる向きへプレイテストで再調整済み。
const WATER_DIRECTION = { yaw: 0, pitch: -0.3 };
const WATER_ANGULAR_RADIUS = 0.15; // rad（約8.6度、水面は的が大きいのでTREE_ANGULAR_RADIUSより広め）

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

// UIの消灯（Phase U）。無操作でナビボタン・所持品トレイが消え、世界だけが残る。
const IDLE_SECONDS = 8;
const IDLE_FADE_OUT_SECONDS = 1.5; // idle化: ゆっくりフェードアウト
const IDLE_FADE_IN_SECONDS = 0.3; // 復帰: すぐフェードイン
const NAV_BUTTON_OPACITY = 0.7; // 通常時の視認性を一段下げる
const NAV_BUTTON_HOVER_OPACITY = 1.0;

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

// スポットごとに PanoScene を1つずつ用意し、可視状態の切替でクロスフェード先を表示する
// （テクスチャの再読込を避けるため、遷移のたびに作り直さない）。
const pmremGenerator = new THREE.PMREMGenerator(engine.renderer);
const panoScenes = new Map<Spot['id'], PanoScene>();
for (const spot of SPOTS) {
  const pano = new PanoScene(
    spot.panoUrl,
    spot.id === 'campsite'
      ? (texture) => {
          // 焚き火の石・薪等の前景3Dを実写の色に馴染ませるため、campsite写真そのものを
          // 環境マップとして焼き込む（v1のような合成スカイシェーダは不要になった）。
          engine.scene.environment = pmremGenerator.fromEquirectangular(texture).texture;
          pmremGenerator.dispose();
        }
      : undefined,
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
const input = new Input();
const interaction = new Interaction(engine.camera, input, gs, engine.renderer.domElement);
interaction.onBlocked((message) => hud.flashMessage(message));

function refreshInventory(): void {
  hud.setInventory(gs.logs, gs.kettle);
}
gs.on('logs-changed', refreshInventory);
gs.on('kettle-changed', refreshInventory);
refreshInventory();

const chopping = new Chopping(engine.scene, engine.camera, audio, gs, TREE_DIRECTION, TREE_ANGULAR_RADIUS);
const fire = new Fire(engine.scene, gs, audio, FIRE_POSITION);
const cooking = new Cooking(
  gs,
  hud,
  audio,
  interaction,
  lookControls,
  engine.scene,
  engine.camera,
  FIRE_POSITION,
  FIRE_LOOK_DIRECTION,
  WATER_DIRECTION,
  WATER_ANGULAR_RADIUS
);

/**
 * 伐採・焚き火・ケトルは campsite だけ、水汲みは riverside だけで有効にする。
 * snowfield には体験ホットスポットを置かない（眺めと音に浸る場所）。
 * ホットスポットの登録/解除（レイキャスト対象）だけでなく、焚き火・斧・ケトルの3D表示自体も
 * 切り替える（これらは常にシーンに存在するため、切り替えないと別スポットに透けて見えてしまう）。
 */
function updateHotspotsForSpot(spotId: Spot['id']): void {
  const atCampsite = spotId === 'campsite';
  const atRiverside = spotId === 'riverside';

  chopping.setVisible(atCampsite);
  fire.setVisible(atCampsite);
  cooking.setVisible(atCampsite);

  // 一旦すべて外してから、このスポットで有効なものだけ入れ直す（remove は未登録でも安全）。
  interaction.remove(chopping.hotspot);
  interaction.remove(fire.interactable);
  interaction.remove(cooking.fireKettleInteractable);
  interaction.remove(cooking.waterHotspot);

  if (atCampsite) {
    interaction.add(chopping.hotspot);
    interaction.add(fire.interactable);
    interaction.add(cooking.fireKettleInteractable);
  } else if (atRiverside) {
    interaction.add(cooking.waterHotspot);
  }
}
updateHotspotsForSpot(SPOTS[0].id);

const grading = new Grading();
const stars = buildStarField();
engine.scene.add(stars);
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
    updateHotspotsForSpot(spot.id);
    snowfall.setEnabled(spot.snowfall);
    breath.setEnabled(spot.id === 'snowfield');
    reverb.apply(REVERB_PRESETS[spot.id]);
    ambientTargetSpot = spot; // 保険（通常は onApproach で既に切り替わっている）
    playFootsteps(audio.ctx, footstepsBus, GROUND_BY_SPOT[spot.id], TRANSITION_STEP_COUNT); // 到着地の足音
    updateSpotButtons();
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

// 画面端の遷移先ボタン群。専用の要素を #ui-root に直接追加する（HUD.ts はプロンプト/所持品トレイ用）。
// ハブ&スポーク構成のため、現在スポットの destinations 数に応じて複数ボタンを縦に並べる
// （campsite にいるときは「川辺へ →」「雪山へ →」の2つ、riverside/snowfield では1つ）。
const spotButtonsContainer = document.createElement('div');
spotButtonsContainer.style.position = 'fixed';
spotButtonsContainer.style.right = '4%';
spotButtonsContainer.style.bottom = '10%';
spotButtonsContainer.style.display = 'flex';
spotButtonsContainer.style.flexDirection = 'column';
spotButtonsContainer.style.alignItems = 'flex-end';
spotButtonsContainer.style.gap = '0.6rem';
spotButtonsContainer.style.opacity = '1';
spotButtonsContainer.style.transition = `opacity ${IDLE_FADE_IN_SECONDS}s ease`;
// タイトル表示中（engine.start() 前）は見た目上タイトルの下に隠れているだけでキーボードフォーカスは
// 素通りしてしまう（Tab 順序が Title の開始ボタンより前に来てしまう）。visibility: hidden は
// フォーカス対象からも除外されるため、ここで塞いでおく。engine.start() 後の最初のフレームで
// 下の onUpdate が busy/isSitting に応じて visible に戻す。
spotButtonsContainer.style.visibility = 'hidden';
uiRoot.appendChild(spotButtonsContainer);

function makeSpotButton(destinationId: Spot['id']): HTMLButtonElement {
  const button = document.createElement('button');
  button.style.padding = '0.6rem 1.1rem';
  button.style.fontSize = '1rem';
  button.style.fontFamily = 'sans-serif';
  button.style.color = '#fff';
  button.style.background = 'rgba(0, 0, 0, 0.35)';
  button.style.border = '1px solid rgba(255, 255, 255, 0.6)';
  button.style.borderRadius = '999px';
  button.style.cursor = 'pointer';
  button.style.pointerEvents = 'auto';
  button.style.opacity = String(NAV_BUTTON_OPACITY);
  button.style.transition = 'opacity 0.2s ease';
  button.textContent = `${SPOT_LABELS[destinationId]}へ →`;
  button.addEventListener('mouseenter', () => {
    button.style.opacity = String(NAV_BUTTON_HOVER_OPACITY);
  });
  button.addEventListener('mouseleave', () => {
    button.style.opacity = String(NAV_BUTTON_OPACITY);
  });
  button.addEventListener('click', () => {
    if (cooking.isSitting) return; // 座って飲む演出中はスポット遷移を始めない
    const departureSpot = SPOTS.find((s) => s.id === spotManager.current);
    const wasBusy = spotManager.busy;
    void spotManager.transitionTo(destinationId).then((result) => {
      if (result.status === 'failed') {
        hud.flashMessage('たどり着けなかった。通信を確認してもう一度');
      }
    });
    // 遷移が実際に始まった（busy が false→true になった）ときだけ、出発地の足音を鳴らす
    // （フェードアウト開始と同時、というタイミングをここで捉える）。
    if (!wasBusy && spotManager.busy && departureSpot) {
      playFootsteps(audio.ctx, footstepsBus, GROUND_BY_SPOT[departureSpot.id], TRANSITION_STEP_COUNT);
    }
  });
  return button;
}

function updateSpotButtons(): void {
  spotButtonsContainer.replaceChildren();
  const currentSpot = SPOTS.find((s) => s.id === spotManager.current) ?? SPOTS[0];
  for (const destinationId of currentSpot.destinations) {
    spotButtonsContainer.appendChild(makeSpotButton(destinationId));
  }
}
updateSpotButtons();

// スポット遷移時の暗転（黒ではなく白寄りのやわらかい暗転）。
const fadeOverlay = document.createElement('div');
fadeOverlay.style.position = 'fixed';
fadeOverlay.style.inset = '0';
fadeOverlay.style.background = '#f2ece0';
fadeOverlay.style.opacity = '0';
fadeOverlay.style.pointerEvents = 'none';
uiRoot.appendChild(fadeOverlay);

// 無操作でナビボタン・所持品トレイが消え、世界だけが残る（中央の文脈プロンプトは対象外）。
const idleWatcher = new IdleWatcher(IDLE_SECONDS);
idleWatcher.onChange((idle) => {
  hud.setIdle(idle);
  spotButtonsContainer.style.transition = `opacity ${idle ? IDLE_FADE_OUT_SECONDS : IDLE_FADE_IN_SECONDS}s ease`;
  spotButtonsContainer.style.opacity = idle ? '0' : '1';
});
window.addEventListener('mousemove', () => idleWatcher.activity());
window.addEventListener('keydown', () => idleWatcher.activity());
window.addEventListener('pointerdown', () => idleWatcher.activity());

engine.onUpdate((dt) => {
  idleWatcher.update(dt);
  spotManager.update(dt);
  // スポット遷移中・座って飲む演出中はユーザーのドラッグ見回しを止める
  // （lookControls.enabled の書き手が複数あるため、毎フレームここで合成する）。
  lookControls.enabled = !spotManager.busy && !cooking.isSitting;
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

  const starVisible = dayness < STAR_HIDE_DAYNESS;
  stars.visible = starVisible;
  (stars.material as THREE.PointsMaterial).opacity = starVisible
    ? THREE.MathUtils.clamp(1 - dayness / STAR_HIDE_DAYNESS, 0, 1)
    : 0;

  ambientWindMix = approachValue(ambientWindMix, ambientTargetSpot.audioMix.wind, dt);
  ambientRiverMix = approachValue(ambientRiverMix, ambientTargetSpot.audioMix.river, dt);
  applyAmbientAudio(dayness, gusts.strength);

  fadeOverlay.style.opacity = String(spotManager.fadeOpacity);
  spotButtonsContainer.style.visibility = spotManager.busy || cooking.isSitting ? 'hidden' : 'visible';
  // 暗転が完了してもまだ遷移先の読み込みが終わっていない間、待たされている理由を示す。
  if (spotManager.pendingPrepare) {
    hud.flashMessage('向かっている…', 5);
  }

  const { prompt } = interaction.update();
  hud.setPrompt(prompt);
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
    engine.start();
  },
  () => {
    tryUnlockAudio();
  },
  () => {
    credits.toggle();
  }
);
title.show();
