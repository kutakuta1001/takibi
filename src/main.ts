import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { PlayerController } from './core/PlayerController';
import { Title } from './ui/Title';
import { Terrain } from './world/Terrain';

const appContainer = document.getElementById('app');
if (!appContainer) {
  throw new Error('#app が見つかりません');
}

const engine = new Engine(appContainer);

const placeholderGround = engine.scene.getObjectByName('placeholder-ground');
if (placeholderGround) {
  engine.scene.remove(placeholderGround);
}

const terrain = new Terrain();
engine.scene.add(terrain.mesh);

const input = new Input();
const playerController = new PlayerController(engine.camera, input, (x, z) =>
  terrain.heightAt(x, z)
);

engine.onUpdate((dt) => {
  playerController.update(dt);
});

const title = new Title(() => {
  engine.start();
});
title.show();
