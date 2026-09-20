export const concepts = [
  { id: "01", name: "The Last Breath", kind: "Cinematic / Atmospheric", description: "Enter a living forest. Feel what disappears.", color: "#b9d698", words: ["Breathe", "Absence", "Distance", "Observe", "Understand", "Act"] },
  { id: "02", name: "Orbit / 042", kind: "Orbital / Scientific", description: "Leave the ground. Find the signal in the noise.", color: "#89d6ff", words: ["Depart", "Blind spots", "Acquire", "Fuse", "Resolve", "Respond"] },
  { id: "03", name: "The Living Archive", kind: "Editorial / Tactile", description: "Read the forest, one layer of time at a time.", color: "#e5d9ba", words: ["Collect", "Uncover", "Read", "Layer", "Measure", "Preserve"] },
  { id: "04", name: "Ghost Forest", kind: "Generative / Immersive", description: "Every missing tree leaves a measurable echo.", color: "#c4a9ff", words: ["Presence", "Erasure", "Echo", "Structure", "Carbon", "Continuity"] },
  { id: "05", name: "The Witness", kind: "Documentary / Investigative", description: "Follow the evidence. Make the invisible undeniable.", color: "#f6b574", words: ["Witness", "Compare", "Investigate", "Corroborate", "Quantify", "Verify"] },
];
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const range = (p: number, start: number, end: number) => clamp((p - start) / (end - start));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export function random(seed: number) { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); }
