import * as THREE from 'three';
import Alea from 'alea';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { Title } from './ui/Title';
import { HUD } from './ui/HUD';
import { PanoScene } from './pano/PanoScene';
import { LookControls } from './pano/LookControls';
import { SpotManager, type Spot } from './pano/SpotManager';
import { Snowfall } from './pano/Snowfall';
import { Grading } from './pano/Grading';
import { GameState } from './systems/GameState';
import { Interaction } from './systems/Interaction';
import { Chopping } from './foreground/Chopping';
import { Fire } from './foreground/Fire';
import { Cooking } from './foreground/Cooking';
import { AudioEngine } from './audio/AudioEngine';
import { createWind, createRiver, createBirds, createInsects } from './audio/synths';

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

const engine = new Engine(appContainer);

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
      : undefined
  );
  pano.mesh.visible = spot.id === SPOTS[0].id;
  engine.scene.add(pano.mesh);
  panoScenes.set(spot.id, pano);
}

const lookControls = new LookControls(engine.camera, engine.renderer.domElement);

const audio = new AudioEngine();
const wind = createWind(audio.ctx);
wind.output.connect(audio.master);
const river = createRiver(audio.ctx);
river.output.connect(audio.master);
const birds = createBirds(audio.ctx);
birds.output.connect(audio.master);
const insects = createInsects(audio.ctx);
insects.output.connect(audio.master);

/**
 * wind/river はスポット固定のミックス、birds/insects は「そのスポットで鳴き得るか
 * （Spot.audioMix の boolean）」と「今何時か（Grading.dayness）」を組み合わせて毎フレーム決める
 * （鳥は夕方側 dayness>0.4、虫は夜側 dayness<0.3 で createBirds/createInsects の閾値と噛み合う）。
 */
function applyAmbientAudio(spot: Spot, dayness: number): void {
  wind.setIntensity(spot.audioMix.wind);
  river.setIntensity(spot.audioMix.river);
  birds.setIntensity(spot.audioMix.birds ? dayness : 0);
  insects.setIntensity(spot.audioMix.insects ? dayness : 1);
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

const spotManager = new SpotManager(SPOTS, (spot) => {
  for (const [id, pano] of panoScenes) {
    pano.mesh.visible = id === spot.id;
  }
  updateHotspotsForSpot(spot.id);
  snowfall.setEnabled(spot.snowfall);
  updateSpotButtons();
});

// 画面端の遷移先ボタン群。ui/HUD.ts は無改修のまま、専用の要素を #ui-root に直接追加する。
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
  button.textContent = `${SPOT_LABELS[destinationId]}へ →`;
  button.addEventListener('click', () => {
    if (cooking.isSitting) return; // 座って飲む演出中はスポット遷移を始めない
    void spotManager.transitionTo(destinationId);
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

engine.onUpdate((dt) => {
  spotManager.update(dt);
  // スポット遷移中・座って飲む演出中はユーザーのドラッグ見回しを止める
  // （lookControls.enabled の書き手が複数あるため、毎フレームここで合成する）。
  lookControls.enabled = !spotManager.busy && !cooking.isSitting;
  lookControls.update(dt);
  chopping.update(dt);
  gs.tick(dt);
  snowfall.update(dt);

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

  const currentSpot = SPOTS.find((s) => s.id === spotManager.current) ?? SPOTS[0];
  applyAmbientAudio(currentSpot, dayness);

  fadeOverlay.style.opacity = String(spotManager.fadeOpacity);
  spotButtonsContainer.style.visibility = spotManager.busy || cooking.isSitting ? 'hidden' : 'visible';

  const { prompt } = interaction.update();
  hud.setPrompt(prompt);
});

const title = new Title(
  () => {
    engine.start();
  },
  () => {
    audio.unlock();
  }
);
title.show();
