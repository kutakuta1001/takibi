import { Engine } from './core/Engine';
import { Title } from './ui/Title';
import { PanoScene } from './pano/PanoScene';
import { LookControls } from './pano/LookControls';
import { AudioEngine } from './audio/AudioEngine';
import { createWind } from './audio/synths';

const EYE_HEIGHT = 1.6; // v1 PlayerController.EYE_HEIGHT を踏襲（前景3D配置の基準に使う）
const CAMPSITE_WIND_LEVEL = 0.3; // P2 の SpotManager audioMix.campsite.wind の先行値

const appContainer = document.getElementById('app');
if (!appContainer) {
  throw new Error('#app が見つかりません');
}

const engine = new Engine(appContainer);

// Engine.ts は他用途でも使うため無改修のまま、地形時代のプレースホルダー地面とフォグは
// このパノラマ体験には不要なのでここで取り除く（フォグは実写と馴染まず遠景を白飛びさせる）。
const placeholderGround = engine.scene.getObjectByName('placeholder-ground');
if (placeholderGround) {
  engine.scene.remove(placeholderGround);
}
engine.scene.fog = null;
engine.camera.position.set(0, EYE_HEIGHT, 0);

const panoScene = new PanoScene('/panos/campsite.jpg');
engine.scene.add(panoScene.mesh);

const lookControls = new LookControls(engine.camera, engine.renderer.domElement);

const audio = new AudioEngine();
const wind = createWind(audio.ctx);
wind.output.connect(audio.master);
wind.setIntensity(CAMPSITE_WIND_LEVEL);

engine.onUpdate((dt) => {
  lookControls.update(dt);
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
