import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { PlayerController } from './core/PlayerController';
import { Title } from './ui/Title';

const appContainer = document.getElementById('app');
if (!appContainer) {
  throw new Error('#app が見つかりません');
}

const engine = new Engine(appContainer);
const input = new Input();
const heightAt = (): number => 0;
const playerController = new PlayerController(engine.camera, input, heightAt);

engine.onUpdate((dt) => {
  playerController.update(dt);
});

const title = new Title(() => {
  engine.start();
});
title.show();
