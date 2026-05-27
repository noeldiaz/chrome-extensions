// The live behaviour behind all three tools, shared by the popup and the full
// page. State lives in chrome.storage.local (keyed by tool) so a running timer or
// stopwatch survives the popup closing and stays in lock-step between the popup
// and an open full-page tab. Pure formatting/maths live in lib.js.
import { t } from "./i18n.js";
import {
  ALERT_DEFAULTS,
  TIMER_MIN_MS,
  clampTimerMs,
  formatClock,
  formatDate,
  formatStopwatch,
  formatTimer,
  hmsToMs,
  lapRows,
  remainingMs,
  stopwatchElapsed,
} from "./lib.js";

const DEFAULTS = {
  tool: "clock",
  clockFormat: "24", // "24" | "12"
  clockSeconds: true,
  clockDateFs: false, // keep the date visible under the clock in fullscreen
  swHundredths: true, // show the stopwatch's centiseconds (.CC)
  timerTrim: false, // hide leading zero groups on the countdown (4:54 vs 00:04:54)
  alerts: { ...ALERT_DEFAULTS },
  sw: { running: false, startTime: 0, elapsed: 0, laps: [] },
  tm: { status: "idle", endTime: 0, remaining: 0, duration: 0 }, // idle|running|paused|ended
};

let state = structuredClone(DEFAULTS);
let mode = "compact";
let els = {};
let audioCtx = null;
let alertedFor = null; // endTime we've already chimed for, so we ring exactly once
let selectedPreset = null; // seconds of the chosen preset chip; reset returns here (or 00)

const $ = (id) => document.getElementById(id);
// Swap a primary button's glyph to match its state (play / pause / stop / restart).
// Each button carries the icons as hidden [data-ic] svgs, toggled like moon/sun.
const setPrimaryIcon = (btn, which) => {
  if (!btn) return;
  for (const ic of btn.querySelectorAll("[data-ic]")) ic.classList.toggle("hidden", ic.dataset.ic !== which);
};
const showPanel = (name) => {
  for (const tool of ["clock", "stopwatch", "timer"]) {
    $(`panel-${tool}`)?.classList.toggle("hidden", tool !== name);
  }
  for (const btn of document.querySelectorAll("[data-tool]")) {
    btn.classList.toggle("is-active", btn.dataset.tool === name);
  }
};

async function load() {
  const got = await chrome.storage.local.get(DEFAULTS);
  state = { ...DEFAULTS, ...got, alerts: { ...ALERT_DEFAULTS, ...(got.alerts || {}) } };
}

const persist = (patch) => {
  Object.assign(state, patch);
  return chrome.storage.local.set(patch);
};

// ---- clock ----------------------------------------------------------------
function renderClock() {
  if (!els.clockTime) return;
  const now = new Date();
  const { h, m, s, ampm } = formatClock(now, { hour12: state.clockFormat === "12" });
  const time = state.clockSeconds ? `${h}:${m}:${s}` : `${h}:${m}`;
  els.clockTime.textContent = ampm ? `${time} ${ampm}` : time;
  if (els.clockDate) els.clockDate.textContent = formatDate(now);
}

// Top-bar bell: a quick mute for the end-of-countdown sound (the same alerts.sound
// the options page exposes). Muted → bell-slash. Lives on the popup and full page.
function renderAlarm() {
  const on = state.alerts.sound;
  $("bell-on")?.classList.toggle("hidden", !on);
  $("bell-off")?.classList.toggle("hidden", on);
  const btn = $("alarm-toggle");
  if (btn) {
    const label = t(on ? "alarmMute" : "alarmUnmute");
    if (label) {
      btn.title = label;
      btn.setAttribute("aria-label", label);
    }
  }
}

// Top-bar flash toggle: the end-of-countdown screen flash (alerts.flash, the same
// the options page exposes). Off → bolt-slash. Lives on the popup and full page.
function renderFlash() {
  const on = state.alerts.flash;
  $("flash-on")?.classList.toggle("hidden", !on);
  $("flash-off")?.classList.toggle("hidden", on);
  const btn = $("flash-toggle");
  if (btn) {
    const label = t(on ? "flashDisable" : "flashEnable");
    if (label) {
      btn.title = label;
      btn.setAttribute("aria-label", label);
    }
  }
}

// The on-page clock settings (full page only) and the date's fullscreen visibility.
const togglePill = (btn, on) => btn?.classList.toggle("is-on", !!on);
function renderClockControls() {
  $("clk-24")?.classList.toggle("is-active", state.clockFormat === "24");
  $("clk-12")?.classList.toggle("is-active", state.clockFormat === "12");
  togglePill($("clk-seconds"), state.clockSeconds);
  togglePill($("clk-datefs"), state.clockDateFs);
  // fs-hide drops an element in fullscreen; the date keeps it unless opted in.
  els.clockDate?.classList.toggle("fs-hide", !state.clockDateFs);
}

// ---- stopwatch ------------------------------------------------------------
function renderStopwatch() {
  if (!els.swTime) return;
  const { running, laps } = state.sw;
  const cs = { hundredths: state.swHundredths };
  els.swTime.textContent = formatStopwatch(stopwatchElapsed(state.sw), cs);

  if (els.swStartLabel) els.swStartLabel.textContent = running ? "Stop" : laps.length || stopwatchElapsed(state.sw) ? "Resume" : "Start";
  els.swStart?.classList.toggle("is-danger", running);
  setPrimaryIcon(els.swStart, running ? "stop" : "play");

  if (els.swSecondLabel) els.swSecondLabel.textContent = running ? "Lap" : "Reset";
  setPrimaryIcon(els.swSecond, running ? "lap" : "reset");
  const idle = !running && stopwatchElapsed(state.sw) === 0 && laps.length === 0;
  if (els.swSecond) els.swSecond.disabled = idle;

  if (els.swLaps) {
    const rows = lapRows(laps);
    const full = mode === "full"; // the tab page shows the lap list larger than the popup
    els.swLaps.replaceChildren();
    for (const r of rows) {
      const li = document.createElement("li");
      li.className = `flex items-center justify-between gap-3 px-1 tabular-nums border-b border-slate-100 last:border-0 dark:border-slate-800 ${full ? "py-2 text-xl" : "py-1 text-sm"}`;
      const idx = document.createElement("span");
      idx.className = `text-slate-400 dark:text-slate-500 ${full ? "w-12" : "w-8"}`;
      idx.textContent = String(r.index).padStart(2, "0");
      const split = document.createElement("span");
      split.className = "flex-1 text-center font-medium text-slate-800 dark:text-slate-100";
      split.textContent = formatStopwatch(r.splitMs, cs);
      const total = document.createElement("span");
      total.className = "flex-1 text-right text-slate-400 dark:text-slate-500";
      total.textContent = formatStopwatch(r.totalMs, cs);
      li.append(idx, split, total);
      els.swLaps.append(li);
    }
    els.swLapsWrap?.classList.toggle("hidden", rows.length === 0);
  }
}

function swToggle() {
  const now = Date.now();
  if (state.sw.running) {
    persist({ sw: { ...state.sw, running: false, elapsed: stopwatchElapsed(state.sw, now) } });
  } else {
    persist({ sw: { ...state.sw, running: true, startTime: now } });
  }
  renderStopwatch();
}

function swSecond() {
  if (state.sw.running) {
    const laps = [...state.sw.laps, stopwatchElapsed(state.sw)];
    persist({ sw: { ...state.sw, laps } });
  } else {
    persist({ sw: { running: false, startTime: 0, elapsed: 0, laps: [] } });
  }
  renderStopwatch();
}

// ---- timer ----------------------------------------------------------------
function renderTimer() {
  if (!els.tmTime) return;
  const { status } = state.tm;
  const idle = status === "idle";
  els.tmSetup?.classList.toggle("hidden", !idle);
  els.tmDisplay?.classList.toggle("hidden", idle);

  const ms = status === "running" ? remainingMs(state.tm.endTime) : status === "paused" ? state.tm.remaining : status === "ended" ? 0 : state.tm.duration;
  els.tmTime.textContent = formatTimer(ms, { trimLeading: state.timerTrim });
  els.tmDisplay?.classList.toggle("is-ended", status === "ended");

  if (els.tmStartLabel) {
    els.tmStartLabel.textContent = status === "running" ? "Pause" : status === "paused" ? "Resume" : status === "ended" ? "Restart" : "Start";
  }
  els.tmStart?.classList.toggle("is-danger", status === "running");
  setPrimaryIcon(els.tmStart, status === "running" ? "pause" : status === "ended" ? "restart" : "play");
}

function bg(type, payload = {}) {
  try {
    chrome.runtime.sendMessage({ type, ...payload }, () => void chrome.runtime.lastError);
  } catch {
    /* background unreachable — page-side tick + alerts still cover an open surface */
  }
}

function tmStart() {
  primeAudio();
  const now = Date.now();
  const { status } = state.tm;
  if (status === "running") {
    // pause
    persist({ tm: { ...state.tm, status: "paused", remaining: remainingMs(state.tm.endTime, now) } });
    bg("timer:clear");
  } else if (status === "paused") {
    const endTime = now + state.tm.remaining;
    persist({ tm: { ...state.tm, status: "running", endTime } });
    bg("timer:start", { endTime });
  } else {
    // idle or ended → (re)start. From idle read the inputs; from ended reuse duration.
    const duration = status === "ended" ? state.tm.duration : hmsToMs(readInputs());
    if (duration < TIMER_MIN_MS) return;
    const endTime = now + duration;
    alertedFor = null;
    persist({ tm: { status: "running", endTime, remaining: duration, duration } });
    bg("timer:start", { endTime });
  }
  renderTimer();
}

function tmReset() {
  persist({ tm: { status: "idle", endTime: 0, remaining: 0, duration: 0 } });
  bg("timer:clear");
  // back to the selected preset if one is chosen, otherwise all 00
  if (selectedPreset) setInputsFromSeconds(selectedPreset);
  else clearInputs();
  renderTimer();
}

function readInputs() {
  return {
    h: Number(els.tmH?.value) || 0,
    m: Number(els.tmM?.value) || 0,
    s: Number(els.tmS?.value) || 0,
  };
}

function setInputsFromSeconds(seconds) {
  const total = clampTimerMs(seconds * 1000) / 1000;
  if (els.tmH) els.tmH.value = Math.floor(total / 3600) || "";
  if (els.tmM) els.tmM.value = Math.floor((total % 3600) / 60) || "";
  if (els.tmS) els.tmS.value = Math.floor(total % 60) || "";
}

// Empty fields read as 00 — the first-load and no-preset reset state.
function clearInputs() {
  for (const f of [els.tmH, els.tmM, els.tmS]) if (f) f.value = "";
}

function highlightPresets() {
  for (const chip of document.querySelectorAll(".tm-preset")) {
    chip.classList.toggle("is-active", Number(chip.dataset.seconds) === selectedPreset);
  }
}

// On-page end alerts. Sound is owned by the background's offscreen player so it
// rings even with every window closed; we only chime here as the fallback on
// engines without an offscreen document (Safari/Firefox). The flash is page-side.
function fireAlerts() {
  if (state.alerts.sound && !chrome.offscreen) beep();
  if (state.alerts.flash) {
    document.body.classList.remove("flashing");
    void document.body.offsetWidth; // restart the CSS animation
    document.body.classList.add("flashing");
    setTimeout(() => document.body.classList.remove("flashing"), 1600);
  }
}

function primeAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  audioCtx?.resume?.();
}

function beep() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  // three short rising blips
  [0, 0.22, 0.44].forEach((t, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660 + i * 220;
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.2);
  });
}

// ---- shared tick + wiring -------------------------------------------------
function tick() {
  if (state.tool === "clock") renderClock();
  else if (state.tool === "stopwatch" && state.sw.running) renderStopwatch();
  else if (state.tool === "timer") renderTimer();

  // End detection runs regardless of the visible tab so an open surface reacts.
  // The background owns the state flip + sound + notification (deduped), so it's
  // consistent whether the timer ends with a window open or closed.
  if (state.tm.status === "running" && remainingMs(state.tm.endTime) <= 0 && alertedFor !== state.tm.endTime) {
    alertedFor = state.tm.endTime;
    bg("timer:ended");
    fireAlerts();
    renderTimer();
  }
  requestAnimationFrame(tick);
}

function selectTool(tool) {
  persist({ tool });
  showPanel(tool);
  renderClock();
  renderClockControls();
  renderStopwatch();
  renderTimer();
}

export async function initApp(opts = {}) {
  mode = opts.mode || "compact";
  await load();

  els = {
    clockTime: $("clock-time"),
    clockDate: $("clock-date"),
    swTime: $("sw-time"),
    swLaps: $("sw-laps"),
    swLapsWrap: $("sw-laps-wrap"),
    swStart: $("sw-start"),
    swStartLabel: $("sw-start-label"),
    swSecond: $("sw-second"),
    swSecondLabel: $("sw-second-label"),
    tmTime: $("tm-time"),
    tmSetup: $("tm-setup"),
    tmDisplay: $("tm-display"),
    tmH: $("tm-h"),
    tmM: $("tm-m"),
    tmS: $("tm-s"),
    tmStart: $("tm-start"),
    tmStartLabel: $("tm-start-label"),
    tmReset: $("tm-reset"),
  };

  for (const btn of document.querySelectorAll("[data-tool]")) {
    btn.addEventListener("click", () => selectTool(btn.dataset.tool));
  }
  els.swStart?.addEventListener("click", swToggle);
  els.swSecond?.addEventListener("click", swSecond);
  els.tmStart?.addEventListener("click", tmStart);
  els.tmReset?.addEventListener("click", tmReset);
  for (const chip of document.querySelectorAll(".tm-preset")) {
    chip.addEventListener("click", () => {
      selectedPreset = Number(chip.dataset.seconds);
      setInputsFromSeconds(selectedPreset);
      highlightPresets();
    });
  }
  // typing a custom time deselects the preset, so reset goes back to 00
  for (const f of [els.tmH, els.tmM, els.tmS]) {
    f?.addEventListener("input", () => {
      selectedPreset = null;
      highlightPresets();
    });
  }
  // on-page clock settings (full page)
  for (const b of document.querySelectorAll("[data-fmt]")) {
    b.addEventListener("click", () => {
      persist({ clockFormat: b.dataset.fmt });
      renderClock();
      renderClockControls();
    });
  }
  $("clk-seconds")?.addEventListener("click", () => {
    persist({ clockSeconds: !state.clockSeconds });
    renderClock();
    renderClockControls();
  });
  $("clk-datefs")?.addEventListener("click", () => {
    persist({ clockDateFs: !state.clockDateFs });
    renderClockControls();
  });
  $("alarm-toggle")?.addEventListener("click", () => {
    persist({ alerts: { ...state.alerts, sound: !state.alerts.sound } });
    renderAlarm();
  });
  $("flash-toggle")?.addEventListener("click", () => {
    persist({ alerts: { ...state.alerts, flash: !state.alerts.flash } });
    renderFlash();
  });

  if (mode === "full") wireFullscreen();

  // Reflect changes made in the other surface (popup ↔ full page) live.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in state && newValue !== undefined) state[key] = newValue;
    }
    if ("tool" in changes) showPanel(state.tool);
    renderClockControls();
    renderAlarm();
    renderFlash();
    renderStopwatch();
    renderTimer();
    if (state.tool === "clock") renderClock();
  });

  showPanel(state.tool);
  renderClockControls();
  renderAlarm();
  renderFlash();
  highlightPresets();
  requestAnimationFrame(tick);
}

// ---- fullscreen (full page only) ------------------------------------------
function wireFullscreen() {
  const btn = $("fullscreen");
  const apply = () => document.body.classList.toggle("fs", !!document.fullscreenElement);
  btn?.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener("fullscreenchange", apply);
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "");
    if (typing) return;
    if (e.key === "f" || e.key === "F") btn?.click();
    else if (e.key === " ") {
      e.preventDefault();
      (state.tool === "timer" ? els.tmStart : state.tool === "stopwatch" ? els.swStart : null)?.click();
    }
  });
}
