import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { PlayerController } from './core/PlayerController';
import { Title } from './ui/Title';
import { HUD } from './ui/HUD';
import { Terrain } from './world/Terrain';
import { Forest } from './world/Forest';
import { Sky } from './world/Sky';
import { ForestTheme } from './theme/ForestTheme';
import { AudioEngine } from './audio/AudioEngine';
import { createWind, createRiver, createBirds, createInsects } from './audio/synths';
import { GameState } from './systems/GameState';
import { Interaction, type Interactable } from './systems/Interaction';

const RIVER_GAIN_MAX_DISTANCE = 40;
const RIVER_GAIN_MAX = 0.6;

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

const terrain = new Terrain(theme);
engine.scene.add(terrain.mesh);

const forest = new Forest(theme, terrain);
engine.scene.add(forest.group);

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

// 手動確認用の仮 Interactable（Task 11 で Forest.choppableTrees に置き換える）。
const testRockGeometry = new THREE.IcosahedronGeometry(0.5, 0);
const testRockMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
const testRock = new THREE.Mesh(testRockGeometry, testRockMaterial);
testRock.position.set(2, terrain.heightAt(2, -3) + 0.5, -3);
engine.scene.add(testRock);

let testRockHits = 0;
const testRockInteractable: Interactable = {
  object: testRock,
  prompt: () => `Eで岩を叩く（テスト・${testRockHits}回）`,
  canInteract: () => true,
  interact: () => {
    testRockHits += 1;
  },
};
interaction.add(testRockInteractable);

engine.onUpdate((dt) => {
  playerController.update(dt);
  sky.update(dt);
  gs.tick(dt);

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
