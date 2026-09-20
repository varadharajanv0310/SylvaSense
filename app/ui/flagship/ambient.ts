import { clamp, smooth } from "./model";
// Quiet synthesis, enabled only by a deliberate user gesture. No audio downloads.
export function createAmbient() {
  const audio = new AudioContext();
  const master = audio.createGain();
  master.gain.value = 0;
  master.connect(audio.destination);
  const buffer = audio.createBuffer(1, audio.sampleRate * 4, audio.sampleRate),
    data = buffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < data.length; i++) {
    previous = (previous + (Math.random() * 2 - 1) * 0.025) / 1.025;
    data[i] = previous * 3.5;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1200;
  source.connect(filter);
  filter.connect(master);
  source.start();
  const tone = audio.createOscillator();
  tone.type = "sine";
  tone.frequency.value = 98;
  const toneGain = audio.createGain();
  toneGain.gain.value = 0.008;
  tone.connect(toneGain);
  toneGain.connect(master);
  tone.start();
  let enabled = false;
  return {
    async toggle() {
      enabled = !enabled;
      if (enabled) await audio.resume();
      master.gain.setTargetAtTime(enabled ? 0.2 : 0, audio.currentTime, 0.8);
      return enabled;
    },
    update(p: number, visible: boolean) {
      filter.frequency.setTargetAtTime(
        900 - smooth(p, 0.17, 0.36) * 730 + smooth(p, 0.4, 0.54) * 400,
        audio.currentTime,
        0.5,
      );
      tone.frequency.setTargetAtTime(
        98 + clamp((p - 0.39) * 20) * 49,
        audio.currentTime,
        1,
      );
      master.gain.setTargetAtTime(
        enabled && visible ? 0.2 : 0,
        audio.currentTime,
        0.4,
      );
    },
    dispose() {
      source.stop();
      tone.stop();
      audio.close().catch(() => {});
    },
  };
}
