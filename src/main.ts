import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { PlayerController } from './core/PlayerController';
import { Title } from './ui/Title';
import { HUD } from './ui/HUD';
import { Terrain } from './world/Terrain';
import { Forest } from './world/Forest';
import { River } from './world/River';
import { Sky } from './world/Sky';
import { ForestTheme } from './theme/ForestTheme';
import type { Theme } from './theme/Theme';
import { AudioEngine } from './audio/AudioEngine';
import { createWind, createRiver, createBirds, createInsects } from './audio/synths';
import { GameState } from './systems/GameState';
import { Interaction } from './systems/Interaction';
import { Chopping } from './systems/Chopping';
import { Fire } from './systems/Fire';
import { WaterZone } from './systems/Water';
import { Cooking } from './systems/Cooking';

const RIVER_GAIN_MAX_DISTANCE = 40;
const RIVER_GAIN_MAX = 0.6;
const ENV_MAP_INTENSITY_LOG2 = 0.04; // PMREMGenerator.fromScene の sigma（ぼかし量）

/**
 * 水面などのフレネル的な照り返し用に、空の色グラデーションだけの簡易シーンを
 * PMREMGenerator で環境マップへ焼き込む（Sky.ts のシェーダそのものは使わず、
 * 昼の空色を近似した静的環境。時間帯ごとの再生成は行わない簡略化）。
 */
function buildSkyEnvironment(renderer: THREE.WebGLRenderer, theme: Theme): THREE.Texture {
  const envScene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(1, 32, 16);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const top = new THREE.Color(theme.sky.dayTop);
  const bottom = new THREE.Color(theme.sky.dayBottom);
  const mixed = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp(position.getY(i) * 0.5 + 0.5, 0, 1);
    mixed.copy(bottom).lerp(top, t);
    colors[i * 3] = mixed.r;
    colors[i * 3 + 1] = mixed.g;
    colors[i * 3 + 2] = mixed.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(geometry, material));

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const renderTarget = pmremGenerator.fromScene(envScene, ENV_MAP_INTENSITY_LOG2);
  pmremGenerator.dispose();
  geometry.dispose();
  material.dispose();
  return renderTarget.texture;
}

// テーマの切替点。雪山対応時はここを SnowTheme に変更するだけでよい。
const theme = ForestTheme;

const appContainer = document.getElementById('app');
if (!appContainer) {
  throw new Error('#app が見つかりません');
}

const engine = new Engine(appContainer, theme);

const placeholderGround = engine.scene.getObjectByName('placeholder-ground');
if (placeholderGround) {
  engine.scene.remove(placeholderGround);
}

engine.scene.environment = buildSkyEnvironment(engine.renderer, theme);

const terrain = new Terrain(theme);
engine.scene.add(terrain.mesh);

const forest = new Forest(theme, terrain);
engine.scene.add(forest.group);

const riverVisual = new River(engine.scene, terrain);

const sky = new Sky(engine.scene, theme);

const audio = new AudioEngine();

const wind = createWind(audio.ctx);
wind.output.connect(audio.master);
wind.setIntensity(theme.ambient.windLevel);

const river = createRiver(audio.ctx);
river.output.connect(audio.master);

const birds = theme.ambient.birds ? createBirds(audio.ctx) : null;
birds?.output.connect(audio.master);

const insects = theme.ambient.insectsAtNight ? createInsects(audio.ctx) : null;
insects?.output.connect(audio.master);

const input = new Input();
const playerController = new PlayerController(engine.camera, input, (x, z) =>
  terrain.heightAt(x, z)
);

const gs = new GameState();
const hud = new HUD();
const interaction = new Interaction(engine.camera, input, gs);

interaction.onBlocked((message) => hud.flashMessage(message));

function refreshInventory(): void {
  hud.setInventory(gs.logs, gs.kettle);
}
gs.on('logs-changed', refreshInventory);
gs.on('kettle-changed', refreshInventory);
refreshInventory();

const chopping = new Chopping(engine.scene, engine.camera, forest, audio, interaction);

const fire = new Fire(engine.scene, gs, audio, terrain.heightAt(0, 0));
interaction.add(fire.interactable);

const waterZone = new WaterZone(engine.scene, audio);
interaction.add(waterZone);

const cooking = new Cooking(gs, fire, hud, audio, playerController, interaction, engine.scene, engine.camera);
interaction.add(cooking.fireKettleInteractable);

engine.onUpdate((dt) => {
  playerController.update(dt);
  sky.update(dt, playerController.position);
  gs.tick(dt);
  chopping.update(dt);
  fire.update(dt, playerController.position);
  cooking.update(dt);
  riverVisual.update(dt);

  const distanceToRiver = Math.abs(playerController.position.x - Terrain.RIVER_X);
  const riverGain = Math.min(Math.max(1 - distanceToRiver / RIVER_GAIN_MAX_DISTANCE, 0), 1) * RIVER_GAIN_MAX;
  river.setIntensity(riverGain);

  birds?.setIntensity(sky.dayness);
  insects?.setIntensity(sky.dayness);

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
