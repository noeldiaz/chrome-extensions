// The live behaviour behind all three tools, shared by the popup and the full
// page. State lives in chrome.storage.local (keyed by tool) so a running timer or
// stopwatch survives the popup closing and stays in lock-step between the popup
// and an open full-page tab. Pure formatting/maths live in lib.js.
import { t } from "./i18n.js";
import { SYNC_KEYS, syncGet, syncSet } from "./sync.js";
import { playChime, CHIME_DEFAULT, VOLUME_DEFAULT } from "./chimes.js";
import {
  ALERT_DEFAULTS,
  TIMER_MIN_MS,
  TIMER_PRESETS,
  clampTimerMs,
  clockHandAngles,
  formatClock,
  formatDate,
  formatStopwatch,
  formatTimer,
  hmsToMs,
  lapRows,
  pad2,
  remainingMs,
  stopwatchElapsed,
  timerTickStep,
} from "./lib.js";

// Preferences live in the active storage area (sync when the user opts in, else
// local); the running state stays local. SYNC_SET partitions reads/writes.
const SYNC_SET = new Set(SYNC_KEYS);

const DEFAULTS = {
  tool: "clock",
  clockStyle: "digital", // "digital" | "analog"
  clockNumerals: true, // print 1–12 around the analog dial
  clockFormat: "24", // "24" | "12"
  clockSeconds: true,
  clockDate: true, // show the date line under the clock
  swHundredths: true, // show the stopwatch's centiseconds (.CC)
  swTrim: false, // hide empty leading groups on the stopwatch (5.18 vs 00:00:05.18)
  timerTrim: false, // hide leading zero groups on the countdown (4:54 vs 00:04:54)
  timerStyle: "digital", // "digital" | "analog" (visual-timer dial)
  timerNumerals: true, // print the time marks around the visual-timer dial
  timerBadge: false, // show the remaining time as a badge on the toolbar icon
  timerOvertime: false, // after zero, keep counting up in red (+0:15) instead of stopping
  timerLast: 0, // last-used countdown length (s); prefilled on open — local, not synced
  timerPresets: [...TIMER_PRESETS], // user-editable quick-fill chips (seconds)
  chime: CHIME_DEFAULT, // end-of-countdown sound — see chimes.js
  chimeVolume: VOLUME_DEFAULT, // 0..1
  alerts: { ...ALERT_DEFAULTS },
  sw: { running: false, startTime: 0, elapsed: 0, laps: [] },
  tm: { status: "idle", endTime: 0, remaining: 0, duration: 0 }, // idle|running|paused|ended
  // multi-timer list (full-page-only "Timers" tab; separate from `tm`).
  // Each item: { id, label, status, endTime, remaining, duration }.
  timers: [],
};

// Cap on concurrent multi-timers — keeps the list scannable.
const MULTI_CAP = 8;
// Tools known across surfaces; "timers" only exists on the full page.
const ALL_TOOLS = ["clock", "stopwatch", "timer", "timers"];

let state = structuredClone(DEFAULTS);
let mode = "compact";
let els = {};
let audioCtx = null;
let alertedFor = null; // endTime we've already chimed for, so we ring exactly once
let selectedPreset = null; // seconds of the chosen preset chip; reset returns here (or 00)
let baseTitle = ""; // the page's plain title; the full page prefixes a running countdown
let lastTitle = ""; // last value written to document.title, so we only set it when it changes
let wakeLock = null; // Screen Wake Lock sentinel (full page only), held while a countdown runs
let activeTool = "clock"; // the tool actually shown — usually state.tool, but the popup clamps "timers" → "timer"
const multiAlerted = new Map(); // id → endTime we've chimed for, so each multi-timer rings exactly once
const mtRows = new Map(); // id → { row, lbl, time, primary } — references for per-frame updates without rebuilding
// Honour the OS "reduce motion" setting: the analog second hand ticks per second
// instead of sweeping, and the visual-timer dial steps once a second.
const reduceMotionMQ = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
let reduceMotion = !!reduceMotionMQ?.matches;

const $ = (id) => document.getElementById(id);
// Speak a one-off message through the visually-hidden live region, so screen
// readers hear discrete events (a countdown ending, a lap) without the per-second
// readouts spamming them. Re-setting identical text wouldn't re-announce, so we
// clear first on a microtask when needed.
const announce = (msg) => {
  if (!els.srStatus || !msg) return;
  els.srStatus.textContent = "";
  els.srStatus.textContent = msg;
};
// Swap a primary button's glyph to match its state (play / pause / stop / restart).
// Each button carries the icons as hidden [data-ic] svgs, toggled like moon/sun.
const setPrimaryIcon = (btn, which) => {
  if (!btn) return;
  for (const ic of btn.querySelectorAll("[data-ic]")) ic.classList.toggle("hidden", ic.dataset.ic !== which);
};
// In the popup, "timers" isn't a real tab — clamp to the single-Timer panel so
// a state.tool set from the full page degrades gracefully.
const safeTool = (name) => (mode === "full" || name !== "timers") ? name : "timer";
const showPanel = (name) => {
  activeTool = safeTool(name);
  for (const tool of ALL_TOOLS) {
    $(`panel-${tool}`)?.classList.toggle("hidden", tool !== activeTool);
  }
  for (const btn of document.querySelectorAll("[data-tool]")) {
    btn.classList.toggle("is-active", btn.dataset.tool === activeTool);
  }
};

async function load() {
  // Preferences come from the active area; running state always from local.
  const localDefaults = {};
  const syncDefaults = {};
  for (const [k, v] of Object.entries(DEFAULTS)) (SYNC_SET.has(k) ? syncDefaults : localDefaults)[k] = v;
  const [localGot, syncGot] = await Promise.all([chrome.storage.local.get(localDefaults), syncGet(syncDefaults)]);
  const got = { ...localGot, ...syncGot };
  state = { ...DEFAULTS, ...got, alerts: { ...ALERT_DEFAULTS, ...(got.alerts || {}) } };
}

// Write each key to its area: synced preferences via the sync helper, running
// state to local. Patches here are single-purpose, but partitioning keeps it safe.
const persist = (patch) => {
  Object.assign(state, patch);
  const local = {};
  const sync = {};
  for (const [k, v] of Object.entries(patch)) (SYNC_SET.has(k) ? sync : local)[k] = v;
  const writes = [];
  if (Object.keys(local).length) writes.push(chrome.storage.local.set(local));
  if (Object.keys(sync).length) writes.push(syncSet(sync));
  return Promise.all(writes);
};

// ---- clock ----------------------------------------------------------------
const SVGNS = "http://www.w3.org/2000/svg";
const svgEl = (name, attrs) => {
  const el = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

// Build the analog face once: a ring, 60 ticks (every 5th bold), three hands and
// a hub. Hands point to 12 and are rotated each frame. Tailwind stroke/fill class
// strings are spelled out literally here so the CSS scan emits them.
function buildAnalog(svg) {
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.append(svgEl("circle", { cx: 50, cy: 50, r: 48, "stroke-width": 1, class: "fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700" }));
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i * 6 * Math.PI) / 180;
    const r1 = 46;
    const r2 = major ? 39 : 43;
    svg.append(svgEl("line", {
      x1: 50 + r1 * Math.sin(a), y1: 50 - r1 * Math.cos(a),
      x2: 50 + r2 * Math.sin(a), y2: 50 - r2 * Math.cos(a),
      "stroke-width": major ? 1.6 : 0.7,
      "stroke-linecap": "round",
      class: major ? "stroke-slate-400 dark:stroke-slate-500" : "stroke-slate-300 dark:stroke-slate-600",
    }));
  }
  // 1–12 numerals as one group, toggled together
  const nums = svgEl("g", { class: "fill-slate-700 dark:fill-slate-200", "font-size": 8, "font-weight": 600, "text-anchor": "middle", "font-family": "system-ui, sans-serif" });
  for (let n = 1; n <= 12; n++) {
    const a = (n * 30 * Math.PI) / 180;
    const r = 33;
    const txt = svgEl("text", { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a), "dominant-baseline": "central" });
    txt.textContent = String(n);
    nums.append(txt);
  }
  svg.append(nums);
  els.analogNums = nums;
  els.handHour = svgEl("line", { x1: 50, y1: 56, x2: 50, y2: 27, "stroke-width": 3.4, "stroke-linecap": "round", class: "stroke-slate-800 dark:stroke-slate-100" });
  els.handMin = svgEl("line", { x1: 50, y1: 58, x2: 50, y2: 17, "stroke-width": 2.4, "stroke-linecap": "round", class: "stroke-slate-700 dark:stroke-slate-200" });
  els.handSec = svgEl("line", { x1: 50, y1: 62, x2: 50, y2: 13, "stroke-width": 1, "stroke-linecap": "round", class: "stroke-blue-500" });
  svg.append(els.handHour, els.handMin, els.handSec);
  svg.append(svgEl("circle", { cx: 50, cy: 50, r: 2.4, class: "fill-slate-800 dark:fill-slate-100" }));
  svg.append(svgEl("circle", { cx: 50, cy: 50, r: 1.1, class: "fill-blue-500" }));
}

const rotate = (el, deg) => el?.setAttribute("transform", `rotate(${deg} 50 50)`);

function renderAnalog(now) {
  els.analogNums?.classList.toggle("hidden", !state.clockNumerals);
  const { hour, minute, second } = clockHandAngles(now);
  rotate(els.handHour, hour);
  rotate(els.handMin, minute);
  els.handSec?.classList.toggle("hidden", !state.clockSeconds);
  // reduced motion: tick to the whole second rather than sweeping with the milliseconds
  if (state.clockSeconds) rotate(els.handSec, reduceMotion ? now.getSeconds() * 6 : second);
}

function renderClock() {
  if (!els.clockTime && !els.clockAnalog) return;
  const now = new Date();
  const analog = state.clockStyle === "analog";
  els.clockTime?.classList.toggle("hidden", analog);
  els.clockAnalog?.classList.toggle("hidden", !analog);
  const { h, m, s, ampm } = formatClock(now, { hour12: state.clockFormat === "12" });
  const time = (state.clockSeconds ? `${h}:${m}:${s}` : `${h}:${m}`) + (ampm ? ` ${ampm}` : "");
  if (analog) {
    renderAnalog(now);
    els.clockAnalog?.setAttribute("aria-label", time); // the SVG reads as the time for screen readers
  } else if (els.clockTime) {
    els.clockTime.textContent = time;
  }
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
  const analog = state.clockStyle === "analog";
  $("clk-digital")?.classList.toggle("is-active", !analog);
  $("clk-analog")?.classList.toggle("is-active", analog);
  // the 24/12 choice only affects the digital readout; the numerals only the dial
  $("clk-format")?.classList.toggle("hidden", analog);
  $("clk-numbers")?.classList.toggle("hidden", !analog);
  $("clk-24")?.classList.toggle("is-active", state.clockFormat === "24");
  $("clk-12")?.classList.toggle("is-active", state.clockFormat === "12");
  togglePill($("clk-seconds"), state.clockSeconds);
  togglePill($("clk-numbers"), state.clockNumerals);
  togglePill($("clk-date"), state.clockDate);
  els.clockDate?.classList.toggle("hidden", !state.clockDate);
}

// ---- stopwatch ------------------------------------------------------------
function renderStopwatch() {
  if (!els.swTime) return;
  const { running, laps } = state.sw;
  const cs = { hundredths: state.swHundredths };
  els.swTime.textContent = formatStopwatch(stopwatchElapsed(state.sw), { ...cs, trimLeading: state.swTrim });
  togglePill($("sw-trim"), state.swTrim);

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
    announce(t("lapAnnounce", [String(laps.length), formatStopwatch(laps.at(-1), { hundredths: state.swHundredths })]));
  } else {
    persist({ sw: { running: false, startTime: 0, elapsed: 0, laps: [] } });
  }
  renderStopwatch();
}

// ---- timer ----------------------------------------------------------------
// The "visual timer": a pie wedge that starts full (whole circle = the chosen
// duration) and empties clockwise to nothing at zero, with a hand at its edge and
// a tick/number scale sized to the total. Built once; ticks rebuilt when the
// duration changes; wedge + hand repainted every frame.
function buildTimerDial(svg) {
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.append(svgEl("circle", { cx: 50, cy: 50, r: 48, "stroke-width": 1, class: "fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700" }));
  els.tmWedge = svgEl("path", { d: "", "fill-opacity": 0.85, class: "fill-blue-500" });
  svg.append(els.tmWedge);
  els.tmTicks = svgEl("g", {});
  svg.append(els.tmTicks);
  els.tmHand = svgEl("line", { x1: 50, y1: 50, x2: 50, y2: 8, "stroke-width": 1.6, "stroke-linecap": "round", class: "stroke-slate-700 dark:stroke-slate-100" });
  svg.append(els.tmHand);
  svg.append(svgEl("circle", { cx: 50, cy: 50, r: 3.4, class: "fill-slate-800 dark:fill-slate-100" }));
  els.tmDialFor = null;
}

function tickLabel(sec, major) {
  const v = Math.round(sec);
  if (major < 60) return String(v); // a seconds dial
  if (v % 60 === 0) return String(v / 60); // whole minutes
  return `${Math.floor(v / 60)}:${pad2(v % 60)}`;
}

function rebuildTimerTicks(totalSec) {
  const { major, minor } = timerTickStep(totalSec);
  els.tmTicks.replaceChildren();
  els.tmNums = svgEl("g", { class: "fill-slate-500 dark:fill-slate-400", "font-size": 6, "font-weight": 600, "text-anchor": "middle", "font-family": "system-ui, sans-serif" });
  for (let t = 0; t <= totalSec + 0.001; t += minor) {
    const major0 = t % major;
    const isMajor = major0 < 0.001 || major - major0 < 0.001;
    const ang = ((t / totalSec) * 360 * Math.PI) / 180;
    const r1 = 46;
    const r2 = isMajor ? 40 : 43.5;
    els.tmTicks.append(svgEl("line", {
      x1: 50 + r1 * Math.sin(ang), y1: 50 - r1 * Math.cos(ang),
      x2: 50 + r2 * Math.sin(ang), y2: 50 - r2 * Math.cos(ang),
      "stroke-width": isMajor ? 1.4 : 0.6, "stroke-linecap": "round",
      class: isMajor ? "stroke-slate-400 dark:stroke-slate-500" : "stroke-slate-300 dark:stroke-slate-600",
    }));
    if (isMajor && t > 0.001) {
      const rN = 33;
      const txt = svgEl("text", { x: 50 + rN * Math.sin(ang), y: 50 - rN * Math.cos(ang), "dominant-baseline": "central" });
      txt.textContent = tickLabel(t, major);
      els.tmNums.append(txt);
    }
  }
  els.tmTicks.append(els.tmNums);
  els.tmDialFor = totalSec;
}

// A pie slice from 12 o'clock, clockwise, covering `f` of the circle (0..1).
function wedgePath(cx, cy, r, f) {
  if (f <= 0) return "";
  if (f >= 1) return `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r} Z`;
  const ang = ((360 * f - 90) * Math.PI) / 180;
  const x = cx + r * Math.cos(ang);
  const y = cy + r * Math.sin(ang);
  return `M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x},${y} Z`;
}

function renderTimerDial(remaining, duration, status) {
  if (!els.tmDial) return;
  const total = Math.max(1, Math.round(duration / 1000));
  if (els.tmDialFor !== total) rebuildTimerTicks(total);
  els.tmNums?.classList.toggle("hidden", !state.timerNumerals);
  // reduced motion: step the wedge/hand once per second (matching the ceil'd digits) rather than sweeping
  const rem = reduceMotion ? Math.ceil(Math.max(0, remaining) / 1000) * 1000 : remaining;
  const f = duration > 0 ? Math.max(0, Math.min(1, rem / duration)) : 0;
  els.tmWedge.setAttribute("d", wedgePath(50, 50, 44, f));
  els.tmWedge.setAttribute("class", status === "ended" ? "fill-rose-500" : "fill-blue-500");
  rotate(els.tmHand, 360 * f);
  els.tmDial.setAttribute("aria-label", formatTimer(Math.max(0, remaining), { trimLeading: state.timerTrim }));
}

// face/numbers switches on the timer tab (full page), mirroring the clock's
function renderTimerControls() {
  const analog = state.timerStyle === "analog";
  $("tm-digital")?.classList.toggle("is-active", !analog);
  $("tm-analog")?.classList.toggle("is-active", analog);
  // numbers only matter on the dial; trimming leading zeros only on the digits
  $("tm-numbers")?.classList.toggle("hidden", !analog);
  $("tm-trim")?.classList.toggle("hidden", analog);
  togglePill($("tm-numbers"), state.timerNumerals);
  togglePill($("tm-trim"), state.timerTrim);
}

function renderTimer() {
  if (!els.tmTime && !els.tmDial) return;
  const { status } = state.tm;
  const idle = status === "idle";
  els.tmSetup?.classList.toggle("hidden", !idle);
  els.tmDisplay?.classList.toggle("hidden", idle);

  const overtime = status === "ended" && state.timerOvertime; // keep counting up past zero
  const ms = status === "running" ? remainingMs(state.tm.endTime) : status === "paused" ? state.tm.remaining : status === "ended" ? 0 : state.tm.duration;
  const analog = state.timerStyle === "analog";
  els.tmTime?.classList.toggle("hidden", analog);
  els.tmDial?.classList.toggle("hidden", !analog);
  if (analog) renderTimerDial(ms, state.tm.duration, status);
  else if (els.tmTime) {
    els.tmTime.textContent = overtime
      ? `+${formatTimer(Math.max(0, Date.now() - state.tm.endTime), { trimLeading: true })}`
      : formatTimer(ms, { trimLeading: state.timerTrim });
  }
  els.tmDisplay?.classList.toggle("is-ended", status === "ended");

  if (els.tmStartLabel) {
    els.tmStartLabel.textContent = status === "running" ? "Pause" : status === "paused" ? "Resume" : status === "ended" ? "Restart" : "Start";
  }
  els.tmStart?.classList.toggle("is-danger", status === "running");
  setPrimaryIcon(els.tmStart, status === "running" ? "pause" : status === "ended" ? "restart" : "play");
}

// Full page only: prefix the tab title with a running countdown ("4:32 — Timer")
// so a backgrounded tab shows the time without switching to it. Only writes when
// the string changes, so the per-frame tick doesn't thrash document.title.
function updateTitle() {
  if (mode !== "full") return;
  const title =
    state.tm.status === "running"
      ? `${formatTimer(remainingMs(state.tm.endTime), { trimLeading: true })} — ${baseTitle}`
      : baseTitle;
  if (title !== lastTitle) {
    document.title = title;
    lastTitle = title;
  }
}

// Full page only: hold a Screen Wake Lock while a countdown runs so the display
// doesn't sleep mid-cook. The browser auto-releases the lock when the tab is
// hidden, so we re-request it on visibility. Engines without the API (Safari) or
// that deny it just no-op — the countdown still runs.
async function updateWakeLock() {
  if (mode !== "full" || !navigator.wakeLock) return;
  const tmRunning = state.tm.status === "running";
  const anyMulti = (state.timers || []).some((x) => x.status === "running");
  const want = (tmRunning || anyMulti) && document.visibilityState === "visible";
  try {
    if (want && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } else if (!want && wakeLock) {
      const held = wakeLock;
      wakeLock = null;
      await held.release();
    }
  } catch {
    /* denied / unavailable — the countdown still runs, just without the lock */
  }
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
    const fromInputs = status !== "ended";
    const duration = fromInputs ? hmsToMs(readInputs()) : state.tm.duration;
    if (duration < TIMER_MIN_MS) return;
    const endTime = now + duration;
    alertedFor = null;
    const patch = { tm: { status: "running", endTime, remaining: duration, duration } };
    if (fromInputs) patch.timerLast = Math.round(duration / 1000); // remember for the next open
    persist(patch);
    bg("timer:start", { endTime });
  }
  renderTimer();
  updateWakeLock();
}

function tmReset() {
  persist({ tm: { status: "idle", endTime: 0, remaining: 0, duration: 0 } });
  bg("timer:clear");
  // reset always returns to 00:00:00 — drop any chosen preset too
  selectedPreset = null;
  clearInputs();
  highlightPresets();
  renderTimer();
  updateWakeLock();
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

// Label for a preset chip — terse in the popup ("5", "1h"), verbose on the full
// page ("5 min", "1 Hour"). Falls back to a digits-style readout for off-grid
// durations a user typed in (e.g. 7:30).
function presetLabel(sec) {
  const compact = mode !== "full";
  if (sec >= 3600 && sec % 3600 === 0) {
    const h = sec / 3600;
    return compact ? `${h}h` : h === 1 ? t("presetHour") : `${h} h`;
  }
  if (sec >= 60 && sec % 60 === 0) {
    const m = sec / 60;
    return compact ? String(m) : t("presetMin", String(m));
  }
  return formatTimer(sec * 1000, { trimLeading: true });
}

// Build the quick-fill chip row from state.timerPresets. Re-runs whenever the
// list changes (here or in another surface), so the popup and the full page
// stay in lock-step with the user's edits in the options page.
function renderPresets() {
  if (!els.tmPresets) return;
  els.tmPresets.replaceChildren();
  const list = Array.isArray(state.timerPresets) ? state.timerPresets : DEFAULTS.timerPresets;
  for (const sec of list) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tm-preset chip";
    chip.dataset.seconds = String(sec);
    chip.textContent = presetLabel(sec);
    chip.addEventListener("click", () => {
      selectedPreset = sec;
      setInputsFromSeconds(sec);
      highlightPresets();
    });
    els.tmPresets.append(chip);
  }
  highlightPresets();
}

// ---- multi-timer (full page "Timers" tab) ---------------------------------
// Lives entirely beside the single-timer state — `state.timers` is a separate
// list, with its own alarms ("multiEnd:<id>") and notifications in the bg.

const newMultiId = () => `mt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Same icon family as the existing single-timer primary, used in each row.
function makeIcon(kind) {
  const svg = svgEl("svg", { viewBox: "0 0 24 24", class: "h-5 w-5", "aria-hidden": "true" });
  if (kind === "play") {
    svg.setAttribute("fill", "currentColor");
    svg.append(svgEl("path", { d: "M6 4l14 8-14 8V4z" }));
  } else if (kind === "pause") {
    svg.setAttribute("fill", "currentColor");
    svg.append(svgEl("path", { d: "M7 5h3v14H7zM14 5h3v14h-3z" }));
  } else if (kind === "restart") {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.append(svgEl("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "M4.5 12a7.5 7.5 0 1 1 2.2 5.3M4.5 12V7.5M4.5 12H9" }));
  } else if (kind === "close") {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.append(svgEl("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "M6 18 18 6M6 6l12 12" }));
  }
  return svg;
}

function clearMtInputs() {
  for (const f of [els.mtH, els.mtM, els.mtS, els.mtLabel]) if (f) f.value = "";
}

function multiAdd() {
  if (!els.mtList) return;
  const ms = hmsToMs({
    h: Number(els.mtH?.value) || 0,
    m: Number(els.mtM?.value) || 0,
    s: Number(els.mtS?.value) || 0,
  });
  if (ms < TIMER_MIN_MS) return;
  if ((state.timers || []).length >= MULTI_CAP) return; // silent cap — list is already full
  const label = String(els.mtLabel?.value || "").trim().slice(0, 60);
  const id = newMultiId();
  const newT = { id, label, status: "running", endTime: Date.now() + ms, remaining: ms, duration: ms };
  persist({ timers: [...(state.timers || []), newT] });
  bg("multi:start", { id, endTime: newT.endTime });
  clearMtInputs();
  els.mtH?.focus();
  updateWakeLock();
}

function multiPause(id) {
  const now = Date.now();
  const timers = (state.timers || []).map((x) =>
    x.id === id && x.status === "running"
      ? { ...x, status: "paused", remaining: Math.max(0, x.endTime - now) }
      : x,
  );
  persist({ timers });
  bg("multi:clear", { id });
  updateWakeLock();
}

function multiResume(id) {
  const now = Date.now();
  let endTime = 0;
  const timers = (state.timers || []).map((x) => {
    if (x.id === id && x.status === "paused") {
      endTime = now + x.remaining;
      return { ...x, status: "running", endTime };
    }
    return x;
  });
  persist({ timers });
  if (endTime) bg("multi:start", { id, endTime });
  updateWakeLock();
}

function multiRestart(id) {
  const now = Date.now();
  let endTime = 0;
  const timers = (state.timers || []).map((x) => {
    if (x.id === id && (x.status === "ended" || x.status === "paused")) {
      endTime = now + x.duration;
      multiAlerted.delete(id); // let the next end re-fire
      return { ...x, status: "running", endTime, remaining: x.duration };
    }
    return x;
  });
  persist({ timers });
  if (endTime) bg("multi:start", { id, endTime });
  updateWakeLock();
}

function multiRemove(id) {
  const timers = (state.timers || []).filter((x) => x.id !== id);
  persist({ timers });
  bg("multi:clear", { id });
  multiAlerted.delete(id);
  updateWakeLock();
}

function multiToggle(id) {
  const tim = (state.timers || []).find((x) => x.id === id);
  if (!tim) return;
  if (tim.status === "running") multiPause(id);
  else if (tim.status === "paused") multiResume(id);
  else if (tim.status === "ended") multiRestart(id);
}

// Build the list of timer rows. Called on add/remove/replace; per-frame text
// updates go through tickMultiTimers without rebuilding so the label inputs
// keep focus while the user types.
function renderMultiTimers() {
  if (!els.mtList) return;
  els.mtList.replaceChildren();
  mtRows.clear();
  if (!state.timers || state.timers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "py-8 text-center text-sm text-slate-400 dark:text-slate-500";
    empty.textContent = t("multiEmpty");
    els.mtList.append(empty);
    return;
  }
  for (const tim of state.timers) {
    const row = document.createElement("div");
    row.className = "flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800";

    const lbl = document.createElement("input");
    lbl.type = "text";
    lbl.value = tim.label || "";
    lbl.maxLength = 60;
    lbl.placeholder = t("multiLabelPlaceholder");
    lbl.className = "min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500";
    lbl.addEventListener("change", () => {
      const v = lbl.value.slice(0, 60);
      const timers = (state.timers || []).map((x) => (x.id === tim.id ? { ...x, label: v } : x));
      persist({ timers });
    });

    const time = document.createElement("div");
    time.className = "display text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50";

    const ctrl = document.createElement("div");
    ctrl.className = "flex items-center gap-1";
    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "icon-btn !p-2";
    for (const kind of ["play", "pause", "restart"]) {
      const ic = makeIcon(kind);
      ic.dataset.ic = kind;
      ic.classList.add("hidden");
      primary.append(ic);
    }
    primary.addEventListener("click", () => multiToggle(tim.id));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn !p-2";
    removeBtn.title = t("multiRemove");
    removeBtn.setAttribute("aria-label", t("multiRemove"));
    removeBtn.append(makeIcon("close"));
    removeBtn.addEventListener("click", () => multiRemove(tim.id));

    ctrl.append(primary, removeBtn);
    row.append(lbl, time, ctrl);
    els.mtList.append(row);
    mtRows.set(tim.id, { row, lbl, time, primary });
  }
  tickMultiTimers(); // paint initial text + icons
}

function tickMultiTimers() {
  if (!mtRows.size) return;
  const now = Date.now();
  for (const tim of state.timers || []) {
    const r = mtRows.get(tim.id);
    if (!r) continue;
    const ms = tim.status === "running"
      ? remainingMs(tim.endTime, now)
      : tim.status === "paused"
        ? tim.remaining
        : tim.status === "ended"
          ? 0
          : tim.duration;
    r.time.textContent = formatTimer(ms, { trimLeading: state.timerTrim });
    const ended = tim.status === "ended";
    r.time.classList.toggle("text-rose-600", ended);
    r.time.classList.toggle("dark:text-rose-400", ended);
    r.time.classList.toggle("text-slate-900", !ended);
    r.time.classList.toggle("dark:text-slate-50", !ended);
    r.row.classList.toggle("border-rose-300", ended);
    r.row.classList.toggle("dark:border-rose-700", ended);
    const which = ended ? "restart" : tim.status === "running" ? "pause" : "play";
    setPrimaryIcon(r.primary, which);
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
  playChime(audioCtx, { chime: state.chime, volume: state.chimeVolume });
}

// ---- shared tick + wiring -------------------------------------------------
function tick() {
  if (activeTool === "clock") renderClock();
  else if (activeTool === "stopwatch" && state.sw.running) renderStopwatch();
  else if (activeTool === "timer") renderTimer();
  else if (activeTool === "timers") tickMultiTimers();
  updateTitle();

  // End detection runs regardless of the visible tab so an open surface reacts.
  // The background owns the state flip + sound + notification (deduped), so it's
  // consistent whether the timer ends with a window open or closed.
  if (state.tm.status === "running" && remainingMs(state.tm.endTime) <= 0 && alertedFor !== state.tm.endTime) {
    alertedFor = state.tm.endTime;
    bg("timer:ended");
    fireAlerts();
    announce(t("notifyTitle"));
    renderTimer();
  }

  // Same pattern for each running multi-timer. The bg deduplicates by status so
  // it doesn't double-end if both surfaces fire at the same moment.
  if (state.timers && state.timers.length > 0) {
    const now = Date.now();
    let anyEnded = false;
    for (const tim of state.timers) {
      if (tim.status === "running" && remainingMs(tim.endTime, now) <= 0 && multiAlerted.get(tim.id) !== tim.endTime) {
        multiAlerted.set(tim.id, tim.endTime);
        bg("multi:ended", { id: tim.id });
        anyEnded = true;
      }
    }
    if (anyEnded) {
      fireAlerts(); // one flash + chime per frame even if several end together
      announce(t("notifyTitle"));
    }
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
  baseTitle = document.title; // captured after localize(); the full page prefixes the countdown
  await load();

  els = {
    clockTime: $("clock-time"),
    clockDate: $("clock-date"),
    clockAnalog: $("clock-analog"),
    swTime: $("sw-time"),
    swLaps: $("sw-laps"),
    swLapsWrap: $("sw-laps-wrap"),
    swStart: $("sw-start"),
    swStartLabel: $("sw-start-label"),
    swSecond: $("sw-second"),
    swSecondLabel: $("sw-second-label"),
    tmTime: $("tm-time"),
    tmDial: $("tm-dial"),
    tmSetup: $("tm-setup"),
    tmDisplay: $("tm-display"),
    tmH: $("tm-h"),
    tmM: $("tm-m"),
    tmS: $("tm-s"),
    tmStart: $("tm-start"),
    tmStartLabel: $("tm-start-label"),
    tmReset: $("tm-reset"),
    tmPresets: $("tm-presets"),
    // multi-timer (full page only — null in popup)
    mtH: $("mt-h"),
    mtM: $("mt-m"),
    mtS: $("mt-s"),
    mtLabel: $("mt-label"),
    mtAdd: $("mt-add"),
    mtList: $("mt-list"),
    srStatus: $("sr-status"),
  };

  for (const btn of document.querySelectorAll("[data-tool]")) {
    btn.addEventListener("click", () => selectTool(btn.dataset.tool));
  }
  els.swStart?.addEventListener("click", swToggle);
  els.swSecond?.addEventListener("click", swSecond);
  $("sw-trim")?.addEventListener("click", () => {
    persist({ swTrim: !state.swTrim });
    renderStopwatch();
  });
  els.tmStart?.addEventListener("click", tmStart);
  els.tmReset?.addEventListener("click", tmReset);
  renderPresets(); // builds the quick-fill chips from state.timerPresets and wires their clicks
  // typing a custom time deselects the preset, so reset goes back to 00
  for (const f of [els.tmH, els.tmM, els.tmS]) {
    f?.addEventListener("input", () => {
      selectedPreset = null;
      highlightPresets();
    });
    // Enter in any field starts the countdown, like a form submit
    f?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        tmStart();
      }
    });
  }
  // on-page clock settings (full page)
  if (els.clockAnalog) buildAnalog(els.clockAnalog);
  if (els.tmDial) buildTimerDial(els.tmDial);
  for (const b of document.querySelectorAll("[data-tmstyle]")) {
    b.addEventListener("click", () => {
      persist({ timerStyle: b.dataset.tmstyle });
      renderTimer();
      renderTimerControls();
    });
  }
  $("tm-numbers")?.addEventListener("click", () => {
    persist({ timerNumerals: !state.timerNumerals });
    renderTimer();
    renderTimerControls();
  });
  $("tm-trim")?.addEventListener("click", () => {
    persist({ timerTrim: !state.timerTrim });
    renderTimer();
    renderTimerControls();
  });
  for (const b of document.querySelectorAll("[data-style]")) {
    b.addEventListener("click", () => {
      persist({ clockStyle: b.dataset.style });
      renderClock();
      renderClockControls();
    });
  }
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
  $("clk-numbers")?.addEventListener("click", () => {
    persist({ clockNumerals: !state.clockNumerals });
    renderClock();
    renderClockControls();
  });
  $("clk-date")?.addEventListener("click", () => {
    persist({ clockDate: !state.clockDate });
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

  // multi-timer panel wiring (full page only)
  els.mtAdd?.addEventListener("click", multiAdd);
  for (const f of [els.mtH, els.mtM, els.mtS, els.mtLabel]) {
    f?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        multiAdd();
      }
    });
  }

  // track live OS "reduce motion" changes; the running tick re-renders with it
  reduceMotionMQ?.addEventListener?.("change", (e) => {
    reduceMotion = e.matches;
  });

  if (mode === "full") {
    wireFullscreen();
    // the wake lock is dropped when the tab hides; reclaim it when it's shown again
    document.addEventListener("visibilitychange", updateWakeLock);
  }

  // Reflect changes made in the other surface (popup ↔ full page) live. Running
  // state changes in local; synced preferences in sync (when on) or local (off),
  // so we honour either area — newValue is authoritative whichever it came from.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" && area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in state && newValue !== undefined) state[key] = newValue;
    }
    if ("tool" in changes) showPanel(state.tool);
    renderClockControls();
    renderAlarm();
    renderFlash();
    renderStopwatch();
    renderTimerControls();
    renderTimer();
    if ("timerPresets" in changes) renderPresets(); // edited in the options page
    if ("timers" in changes) renderMultiTimers(); // add/remove/rename in either surface
    if (state.tool === "clock") renderClock();
    updateWakeLock(); // a countdown started/paused/ended in the other surface
  });

  // prefill the H/M/S fields with the last-used duration when nothing's running yet
  if (state.tm.status === "idle" && state.timerLast > 0) setInputsFromSeconds(state.timerLast);

  showPanel(state.tool);
  renderClock();
  renderClockControls();
  renderAlarm();
  renderFlash();
  renderStopwatch();
  renderTimerControls();
  renderTimer();
  highlightPresets();
  renderMultiTimers();
  updateWakeLock(); // a countdown may already be running when this surface opens
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
    const tag = e.target?.tagName || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    if (e.key === "f" || e.key === "F") btn?.click();
    else if (e.key === " ") {
      // a focused button/link already activates on Space natively — bail so we
      // don't toggle a second time and cancel ourselves out
      if (tag === "BUTTON" || tag === "A") return;
      e.preventDefault();
      (state.tool === "timer" ? els.tmStart : state.tool === "stopwatch" ? els.swStart : null)?.click();
    }
  });
}
