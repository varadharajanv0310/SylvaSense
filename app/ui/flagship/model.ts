export const ASSETS = {
  forest: "/media/deep-forest.jpg",
  canopy: "/media/river-canopy.jpg",
  leaf: "/media/leaf.webp",
} as const;

export const chapters = [
  {
    label: "The living world",
    at: 0,
    end: 0.15,
    act: "I",
    cue: "ENTER THE CANOPY",
  },
  {
    label: "The first absence",
    at: 0.155,
    end: 0.25,
    act: "I",
    cue: "A WORLD UNRAVELLING",
  },
  {
    label: "Heat & silence",
    at: 0.255,
    end: 0.39,
    act: "I",
    cue: "WHAT THE WIND CARRIES",
  },
  {
    label: "A different vision",
    at: 0.395,
    end: 0.535,
    act: "II",
    cue: "THE FOREST BECOMES OBSERVABLE",
  },
  {
    label: "Signals, together",
    at: 0.54,
    end: 0.62,
    act: "II",
    cue: "FOUR LAYERS. ONE LANDSCAPE.",
  },
  {
    label: "Every crown",
    at: 0.625,
    end: 0.72,
    act: "II",
    cue: "FROM CANOPY TO INDIVIDUAL",
  },
  {
    label: "The weight of green",
    at: 0.725,
    end: 0.81,
    act: "III",
    cue: "STRUCTURE BECOMES AN ESTIMATE",
  },
  {
    label: "A record of change",
    at: 0.815,
    end: 0.905,
    act: "III",
    cue: "READ THE YEARS BETWEEN",
  },
  {
    label: "What we keep",
    at: 0.915,
    end: 1,
    act: "III",
    cue: "UNDERSTANDING BECOMES ACTION",
  },
];

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const linear = (x: number, a: number, b: number) =>
  clamp((x - a) / (b - a));
export const smooth = (x: number, a: number, b: number) => {
  const t = linear(x, a, b);
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const random = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return n - Math.floor(n);
};
export const terrain = (x: number, z: number) =>
  Math.sin(x * 0.43) * 0.22 +
  Math.cos(z * 0.6 + x * 0.16) * 0.24 +
  Math.sin(x * 0.9 - z * 0.52) * 0.09;
export const trees = Array.from({ length: 144 }, (_, i) => {
  const x = ((i % 12) - 5.5) * 1.02 + (random(i + 50) - 0.5) * 0.45;
  const z = (Math.floor(i / 12) - 5.5) * 0.87 + (random(i + 70) - 0.5) * 0.4;
  return {
    id: i + 1,
    x,
    z,
    ground: terrain(x, z),
    height: 1.2 + random(i + 110) * 1.55,
    radius: 0.31 + random(i + 290) * 0.24,
    loss: random(i + 890),
    confidence: 0.87 + random(i + 990) * 0.1,
  };
});
export const treeLabel = (n: number) => `S-${String(n + 1).padStart(3, "0")}`;
export type Layer = "optical" | "sar" | "lidar";
export type Frame = {
  p: number;
  time: number;
  velocity: number;
  pointerX: number;
  pointerY: number;
  reduced: boolean;
  mobile: boolean;
  layer: Layer;
  clouds: boolean;
  year: number;
  selected: number;
  carbon: boolean;
  reviewed: boolean;
  intro: number;
};
export const initialFrame: Frame = {
  p: 0,
  time: 0,
  velocity: 0,
  pointerX: 0,
  pointerY: 0,
  reduced: false,
  mobile: false,
  layer: "optical",
  clouds: true,
  year: 2025,
  selected: 67,
  carbon: false,
  reviewed: false,
  intro: 0,
};
export type WorldEngine = {
  update: (f: Frame) => void;
  resize: () => void;
  dispose: () => void;
  pick: (x: number, y: number) => number | null;
};
