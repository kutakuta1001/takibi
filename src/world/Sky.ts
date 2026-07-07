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
const HEMI_INTENSITY_DAY = 1.3;
const HEMI_INTENSITY_NIGHT = 0.12;
const ENV_INTENSITY_DAY = 1.0;
const ENV_INTENSITY_NIGHT = 0.1;

const STAR_HIDE_DAYNESS = 0.25; // これ以上明るい間（昼・夕方含む）は星を完全非表示にする
// sky シェーダの h = normalize(vWorldPosition).y*0.5+0.5 は、カメラがほぼ水平を見る地平線方向では
// 常に h≈0.5（水平方向の視線は空半球の中心付近を向くため）。フォグ色は遠景がその地平線色に
// 沈み込む色なので、bottomColor 単体ではなく top/bottom を 50% ブレンドした「見た目の地平線色」に
// 合わせないと、遠景の木がフォグで白飛びして空と馴染まない（bottomColor は白に近いが実際の
// 地平線はもっと青みがかっている）。
const FOG_HORIZON_BLEND = 0.5;

const SUN_SHADOW_MAP_SIZE = 2048;
const SUN_SHADOW_HALF_EXTENT = 40; // 正方影範囲: プレイヤー中心 ±40m
const SUN_SHADOW_NEAR = 1;
const SUN_SHADOW_FAR = SUN_DISTANCE * 2;
const SUN_SHADOW_BIAS = -0.0005;

const ZERO = new THREE.Vector3(0, 0, 0);

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

  constructor(
    scene: THREE.Scene,
    theme: Theme,
    private readonly hemiLight?: THREE.HemisphereLight
  ) {
    this.scene = scene;

    this.dayTop = new THREE.Color(theme.sky.dayTop);
    this.dayBottom = new THREE.Color(theme.sky.dayBottom);
    this.nightTop = new THREE.Color(theme.sky.nightTop);
    this.nightBottom = new THREE.Color(theme.sky.nightBottom);
    this.fogDay = this.dayBottom.clone().lerp(this.dayTop, FOG_HORIZON_BLEND);
    this.fogNight = this.nightBottom.clone().lerp(this.nightTop, FOG_HORIZON_BLEND);

    this.sunLight = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY_DAY);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(SUN_SHADOW_MAP_SIZE, SUN_SHADOW_MAP_SIZE);
    this.sunLight.shadow.camera.left = -SUN_SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.right = SUN_SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.top = SUN_SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.bottom = -SUN_SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.near = SUN_SHADOW_NEAR;
    this.sunLight.shadow.camera.far = SUN_SHADOW_FAR;
    this.sunLight.shadow.bias = SUN_SHADOW_BIAS;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

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

    this.applyTimeOfDay(ZERO);
  }

  get dayness(): number {
    return this.computeDayness(this.timeOfDay);
  }

  /** playerPos: 太陽の影範囲（shadow.camera）をプレイヤー周辺に追従させるための中心点。 */
  update(dt: number, playerPos: THREE.Vector3 = ZERO): void {
    this.timeOfDay = (this.timeOfDay + dt / CYCLE_SECONDS) % 1;
    this.applyTimeOfDay(playerPos);
  }

  private computeDayness(timeOfDay: number): number {
    const sunAngle = timeOfDay * Math.PI * 2;
    const elevation = -Math.cos(sunAngle); // -1(真夜中)..1(真昼)
    return (elevation + 1) / 2;
  }

  private applyTimeOfDay(playerPos: THREE.Vector3): void {
    const sunAngle = this.timeOfDay * Math.PI * 2;
    const elevation = -Math.cos(sunAngle);
    const dayness = (elevation + 1) / 2;

    const sunDirX = Math.cos(sunAngle) * SUN_DISTANCE;
    const sunDirY = elevation * SUN_DISTANCE;
    const sunDirZ = Math.sin(sunAngle) * SUN_DISTANCE * 0.6;

    // 影範囲（shadow.camera）をプレイヤー中心に保つため、位置はプレイヤー基準のオフセットにする。
    // 方向自体（sunDir*）はプレイヤー位置に依存しないので、月側は従来どおり原点基準のまま。
    this.sunLight.position.set(playerPos.x + sunDirX, sunDirY, playerPos.z + sunDirZ);
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.intensity = THREE.MathUtils.lerp(SUN_INTENSITY_NIGHT, SUN_INTENSITY_DAY, dayness);

    this.moonLight.position.set(-sunDirX, -sunDirY, -sunDirZ);
    this.moonLight.intensity = MOON_INTENSITY_MAX * (1 - dayness);

    // 環境光（HemisphereLight）も dayness に連動させる。固定強度のままだと夜でも
    // 地面が昼と同じ明るさで光ってしまうため（V6で発見した不整合）。
    if (this.hemiLight) {
      this.hemiLight.intensity = THREE.MathUtils.lerp(HEMI_INTENSITY_NIGHT, HEMI_INTENSITY_DAY, dayness);
    }

    // scene.environment（PMREM の簡易空環境）は常に昼の色で焼き込んでいるため、
    // 強度そのものを dayness で落とさないと夜でも地面が明るいままになる。
    this.scene.environmentIntensity = THREE.MathUtils.lerp(ENV_INTENSITY_NIGHT, ENV_INTENSITY_DAY, dayness);

    const topUniform = this.skyMaterial.uniforms.topColor.value as THREE.Color;
    const bottomUniform = this.skyMaterial.uniforms.bottomColor.value as THREE.Color;
    topUniform.copy(this.nightTop).lerp(this.dayTop, dayness);
    bottomUniform.copy(this.nightBottom).lerp(this.dayBottom, dayness);

    const starsMaterial = this.stars.material as THREE.PointsMaterial;
    const starVisible = dayness < STAR_HIDE_DAYNESS;
    this.stars.visible = starVisible;
    starsMaterial.opacity = starVisible
      ? THREE.MathUtils.clamp(1 - dayness / STAR_HIDE_DAYNESS, 0, 1)
      : 0;

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.fogNight).lerp(this.fogDay, dayness);
    }
  }
}
