// Plays the end-of-countdown chime on behalf of the background (an MV3 service
// worker can't use Web Audio). The chime + volume come from the background — via
// the URL query on first load (createDocument) and via a message on reuse.
// Created with the AUDIO_PLAYBACK reason, so it may play without a user gesture.
import { playChime, CHIME_DEFAULT, VOLUME_DEFAULT } from "./chimes.js";

function play({ chime = CHIME_DEFAULT, volume = VOLUME_DEFAULT } = {}) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const dur = playChime(ctx, { chime, volume });
  setTimeout(() => ctx.close().catch(() => {}), Math.ceil((dur + 0.4) * 1000));
}

// Play immediately on load — the background creates this doc to ring once, and
// passes the choice via ?chime=...&volume=... so the very first play matches.
const params = new URLSearchParams(location.search);
play({
  chime: params.get("chime") || CHIME_DEFAULT,
  volume: params.get("volume") != null ? Number(params.get("volume")) : VOLUME_DEFAULT,
});

// If the doc is reused before it's torn down, ring again with the new choice.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target === "offscreen" && msg.type === "beep") {
    play({ chime: msg.chime, volume: msg.volume });
  }
});
