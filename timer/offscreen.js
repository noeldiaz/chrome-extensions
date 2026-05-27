// Plays the end-of-countdown chime on behalf of the background (an MV3 service
// worker can't use Web Audio). The same three rising blips the open page plays.
// Created with the AUDIO_PLAYBACK reason, so it may play without a user gesture.
function chime() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const now = ctx.currentTime;
  [0, 0.22, 0.44].forEach((t, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660 + i * 220;
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.2);
  });
  setTimeout(() => ctx.close().catch(() => {}), 1500);
}

// Play immediately on load (the background creates this doc to ring once)...
chime();
// ...and again on demand if the doc is reused before it's torn down.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target === "offscreen" && msg.type === "beep") chime();
});
