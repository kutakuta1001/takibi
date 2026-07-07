export interface Theme {
  name: string;
  fog: { color: number; density: number };
  sky: { dayTop: number; dayBottom: number; nightTop: number; nightBottom: number };
  ground: { color: number; textures?: { primary: string; secondary: string; repeat: number } };
  trees: { count: number; radius: number; trunkColor: number; leafColor: number };
  ambient: { windLevel: number; birds: boolean; insectsAtNight: boolean; snowfall: boolean };
}
