import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { Title } from './ui/Title';
import { HUD } from './ui/HUD';
import { PanoScene } from './pano/PanoScene';
import { LookControls } from './pano/LookControls';
import { SpotManager, type Spot } from './pano/SpotManager';
import { GameState } from './systems/GameState';
import { Interaction } from './systems/Interaction';
import { Chopping } from './foreground/Chopping';
import { AudioEngine } from './audio/AudioEngine';
import { createWind, createRiver, createBirds, createInsects } from './audio/synths';

// campsite パノラマ内の実際の木の方向（yaw/pitch）。プレイテストで見た目に合わせて調整済み。
const TREE_DIRECTION = { yaw: 0.5, pitch: -0.05 };
const TREE_ANGULAR_RADIUS = 0.08; // rad（約4.6度）

const SPOT_LABELS: Record<Spot['id'], string> = {
  campsite: 'キャンプ地',
  riverside: '川辺',
};

const SPOTS: Spot[] = [
  {
    id: 'campsite',
    panoUrl: '/panos/campsite.jpg',
    audioMix: { wind: 0.3, river: 0.08, birds: true, insects: false },
  },
  {
    id: 'riverside',
    panoUrl: '/panos/riverside.jpg',
    audioMix: { wind: 0.15, river: 0.55, birds: false, insects: false },
  },
];

function otherSpotId(id: Spot['id']): Spot['id'] {
  return id === 'campsite' ? 'riverside' : 'campsite';
}

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
const panoScenes = new Map<Spot['id'], PanoScene>();
for (const spot of SPOTS) {
  const pano = new PanoScene(spot.panoUrl);
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

/** createBirds/createInsects の setIntensity は連続値（P6 で dayness を渡す想定）だが、
 * P2 時点では Spot.audioMix の固定 boolean をそれぞれの閾値の内外にマップして on/off だけ反映する。 */
function applyAudioMix(spot: Spot): void {
  wind.setIntensity(spot.audioMix.wind);
  river.setIntensity(spot.audioMix.river);
  birds.setIntensity(spot.audioMix.birds ? 1 : 0);
  insects.setIntensity(spot.audioMix.insects ? 0 : 1);
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

/** campsite にいる間だけ伐採ホットスポットを有効にする（riverside では同じ方向に木は無い）。 */
function updateHotspotsForSpot(spotId: Spot['id']): void {
  if (spotId === 'campsite') {
    interaction.add(chopping.hotspot);
  } else {
    interaction.remove(chopping.hotspot);
  }
}
updateHotspotsForSpot(SPOTS[0].id);

const spotManager = new SpotManager(SPOTS, (spot) => {
  for (const [id, pano] of panoScenes) {
    pano.mesh.visible = id === spot.id;
  }
  applyAudioMix(spot);
  updateHotspotsForSpot(spot.id);
  updateSpotButton();
});
applyAudioMix(SPOTS[0]);

// 画面端の「川辺へ →」誘導ボタン。ui/HUD.ts は無改修のまま、専用の要素を #ui-root に直接追加する。
const spotButton = document.createElement('button');
spotButton.style.position = 'fixed';
spotButton.style.right = '4%';
spotButton.style.bottom = '10%';
spotButton.style.padding = '0.6rem 1.1rem';
spotButton.style.fontSize = '1rem';
spotButton.style.fontFamily = 'sans-serif';
spotButton.style.color = '#fff';
spotButton.style.background = 'rgba(0, 0, 0, 0.35)';
spotButton.style.border = '1px solid rgba(255, 255, 255, 0.6)';
spotButton.style.borderRadius = '999px';
spotButton.style.cursor = 'pointer';
spotButton.style.pointerEvents = 'auto';
spotButton.addEventListener('click', () => {
  void spotManager.transitionTo(otherSpotId(spotManager.current));
});
uiRoot.appendChild(spotButton);

function updateSpotButton(): void {
  spotButton.textContent = `${SPOT_LABELS[otherSpotId(spotManager.current)]}へ →`;
}
updateSpotButton();

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
  lookControls.enabled = !spotManager.busy;
  lookControls.update(dt);
  chopping.update(dt);
  gs.tick(dt);

  fadeOverlay.style.opacity = String(spotManager.fadeOpacity);
  spotButton.style.visibility = spotManager.busy ? 'hidden' : 'visible';

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
