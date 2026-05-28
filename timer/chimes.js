// End-of-countdown chime palette, shared by the open-page fallback (controllers.js)
// and the background's offscreen player (offscreen.js). Each chime is short, fully
// synthesised — no audio files to ship — and respects a 0..1 volume.

export const CHIMES = ["classic", "bell", "ding"];
export const CHIME_DEFAULT = "classic";
export const VOLUME_DEFAULT = 0.6;

const clampVolume = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return VOLUME_DEFAULT;
  return Math.max(0, Math.min(1, n));
};

// Three rising blips — the original Timer chime. Quick and unmistakable.
function playClassic(ctx, vol) {
  const now = ctx.currentTime;
  const peak = 0.25 * vol;
  [0, 0.22, 0.44].forEach((t, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660 + i * 220;
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.2);
  });
  return 0.7;
}

// A single resonant note with a soft overtone — bell-like, longer decay.
function playBell(ctx, vol) {
  const now = ctx.currentTime;
  const dur = 1.2;
  const make = (freq, peak) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  };
  make(880, 0.3);
  make(1320, 0.1); // overtone for bell colour
  return dur + 0.1;
}

// Two crisp high pings — sharp, brief, attention-grabbing.
function playDing(ctx, vol) {
  const now = ctx.currentTime;
  const peak = 0.3 * vol;
  [
    { t: 0, freq: 1000 },
    { t: 0.14, freq: 1500 },
  ].forEach(({ t, freq }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.15);
  });
  return 0.4;
}

// Play `which` on `ctx` at `volume` (0..1). Returns the approximate duration in
// seconds so the caller can tear down a one-shot AudioContext after.
export function playChime(ctx, { chime = CHIME_DEFAULT, volume = VOLUME_DEFAULT } = {}) {
  const v = clampVolume(volume);
  if (v === 0) return 0;
  switch (chime) {
    case "bell":
      return playBell(ctx, v);
    case "ding":
      return playDing(ctx, v);
    case "classic":
    default:
      return playClassic(ctx, v);
  }
}
