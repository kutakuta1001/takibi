import type { Theme } from './Theme';

export const ForestTheme: Theme = {
  name: 'forest',
  fog: { color: 0xcfd8dc, density: 0.023 },
  sky: { dayTop: 0x7ec8e3, dayBottom: 0xdfeff5, nightTop: 0x0b1026, nightBottom: 0x1b2a4a },
  ground: { color: 0x4a5d3a, textures: { primary: 'grass', secondary: 'ground', repeat: 48 } },
  trees: { count: 400, radius: 95, trunkColor: 0x5b4633, leafColor: 0x3b633b },
  ambient: { windLevel: 0.5, birds: true, insectsAtNight: true, snowfall: false },
};
