import * as THREE from 'three';
import type { Theme } from '../theme/Theme';
import { ForestTheme } from '../theme/ForestTheme';

const DT_MAX = 0.1;

export class Engine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly clock: THREE.Clock;
  private readonly updateCallbacks: Array<(dt: number) => void> = [];

  constructor(container: HTMLElement, theme: Theme = ForestTheme) {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(theme.fog.color, theme.fog.density);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.6, 8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xbfd4e5, 0x3e2f23, 1.0);
    this.scene.add(hemiLight);

    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: theme.ground.color });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.name = 'placeholder-ground';
    this.scene.add(ground);

    this.clock = new THREE.Clock();

    window.addEventListener('resize', () => this.onResize());
  }

  onUpdate(cb: (dt: number) => void): void {
    this.updateCallbacks.push(cb);
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), DT_MAX);
      for (const cb of this.updateCallbacks) {
        cb(dt);
      }
      this.renderer.render(this.scene, this.camera);
    });
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
