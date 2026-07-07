import * as THREE from 'three';
import Alea from 'alea';
import type { Theme } from '../theme/Theme';

const CYCLE_SECONDS = 600;
const INITIAL_TIME_OF_DAY = 0.35;
const STAR_COUNT = 800;
const SKY_RADIUS = 480;
const SUN_DISTANCE = 300;
const SUN_INTENSITY_DAY = 1.2;
const SUN_INTENSITY_NIGHT = 0.05;
const MOON_COLOR = 0x8899bb;
const MOON_INTENSITY_MAX = 0.15;

const SKY_VERTEX_SHADER = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  varying vec3 vWorldPosition;
  void main() {
    float h = normalize(vWorldPosition).y * 0.5 + 0.5;
    gl_FragColor = vec4(mix(bottomColor, topColor, clamp(h, 0.0, 1.0)), 1.0);
  }
`;

/** 球面上に均等分布する星の位置を生成する（上半球のみ、地平線より上）。 */
function buildStarPositions(): Float32Array {
  const positions = new Float32Array(STAR_COUNT * 3);
  const rand = Alea('takibi-stars');
  const radius = SKY_RADIUS * 0.98;

  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi));
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  return positions;
}

export class Sky {
  timeOfDay = INITIAL_TIME_OF_DAY;

  private readonly scene: THREE.Scene;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly moonLight: THREE.DirectionalLight;
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;

  private readonly dayTop: THREE.Color;
  private readonly dayBottom: THREE.Color;
  private readonly nightTop: THREE.Color;
  private readonly nightBottom: THREE.Color;
  private readonly fogDay: THREE.Color;
  private readonly fogNight: THREE.Color;

  constructor(scene: THREE.Scene, theme: Theme) {
    this.scene = scene;

    this.dayTop = new THREE.Color(theme.sky.dayTop);
    this.dayBottom = new THREE.Color(theme.sky.dayBottom);
    this.nightTop = new THREE.Color(theme.sky.nightTop);
    this.nightBottom = new THREE.Color(theme.sky.nightBottom);
    this.fogDay = new THREE.Color(theme.sky.dayBottom);
    this.fogNight = new THREE.Color(theme.sky.nightBottom);

    this.sunLight = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY_DAY);
    scene.add(this.sunLight);

    this.moonLight = new THREE.DirectionalLight(MOON_COLOR, 0);
    scene.add(this.moonLight);

    const skyGeometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: this.dayTop.clone() },
        bottomColor: { value: this.dayBottom.clone() },
      },
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const skyMesh = new THREE.Mesh(skyGeometry, this.skyMaterial);
    scene.add(skyMesh);

    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(buildStarPositions(), 3));
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(this.stars);

    this.applyTimeOfDay();
  }

  get dayness(): number {
    return this.computeDayness(this.timeOfDay);
  }

  update(dt: number): void {
    this.timeOfDay = (this.timeOfDay + dt / CYCLE_SECONDS) % 1;
    this.applyTimeOfDay();
  }

  private computeDayness(timeOfDay: number): number {
    const sunAngle = timeOfDay * Math.PI * 2;
    const elevation = -Math.cos(sunAngle); // -1(真夜中)..1(真昼)
    return (elevation + 1) / 2;
  }

  private applyTimeOfDay(): void {
    const sunAngle = this.timeOfDay * Math.PI * 2;
    const elevation = -Math.cos(sunAngle);
    const dayness = (elevation + 1) / 2;

    this.sunLight.position.set(
      Math.cos(sunAngle) * SUN_DISTANCE,
      elevation * SUN_DISTANCE,
      Math.sin(sunAngle) * SUN_DISTANCE * 0.6
    );
    this.sunLight.intensity = THREE.MathUtils.lerp(SUN_INTENSITY_NIGHT, SUN_INTENSITY_DAY, dayness);

    this.moonLight.position.copy(this.sunLight.position).multiplyScalar(-1);
    this.moonLight.intensity = MOON_INTENSITY_MAX * (1 - dayness);

    const topUniform = this.skyMaterial.uniforms.topColor.value as THREE.Color;
    const bottomUniform = this.skyMaterial.uniforms.bottomColor.value as THREE.Color;
    topUniform.copy(this.nightTop).lerp(this.dayTop, dayness);
    bottomUniform.copy(this.nightBottom).lerp(this.dayBottom, dayness);

    const starsMaterial = this.stars.material as THREE.PointsMaterial;
    starsMaterial.opacity = 1 - dayness;

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.fogNight).lerp(this.fogDay, dayness);
    }
  }
}
