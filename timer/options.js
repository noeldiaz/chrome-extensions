import { localize, t } from "./i18n.js";
import { initTheme } from "./theme.js";
import { ALERT_DEFAULTS, TIMER_PRESETS, hmsToMs } from "./lib.js";
import { isSyncOn, setSyncEnabled, syncGet, syncSet } from "./sync.js";
import { playChime, CHIME_DEFAULT, VOLUME_DEFAULT } from "./chimes.js";

localize();
initTheme({
  toggle: document.getElementById("theme-toggle"),
  moon: document.getElementById("moon-icon"),
  sun: document.getElementById("sun-icon"),
});

// version in the About panel
document.getElementById("version").textContent = chrome.runtime.getManifest().version;

// Close button — close the options tab, falling back to window.close().
document.getElementById("winClose").addEventListener("click", async () => {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch {
    /* fall back to window.close() */
  }
  window.close();
});

// tab switcher — one panel per settings group, plus General (sync) and About
const panels = {
  clock: document.getElementById("opanel-clock"),
  stopwatch: document.getElementById("opanel-stopwatch"),
  timer: document.getElementById("opanel-timer"),
  general: document.getElementById("opanel-general"),
  about: document.getElementById("opanel-about"),
};
for (const btn of document.querySelectorAll("[data-otab]")) {
  btn.addEventListener("click", () => {
    for (const b of document.querySelectorAll("[data-otab]")) {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", String(active));
    }
    for (const [name, panel] of Object.entries(panels)) panel.classList.toggle("hidden", name !== btn.dataset.otab);
  });
}

const seconds = document.getElementById("clock-seconds");
const numbers = document.getElementById("clock-numbers");
const dateLine = document.getElementById("clock-date");
const hundredths = document.getElementById("sw-hundredths");
const swTrim = document.getElementById("sw-trim");
const trim = document.getElementById("timer-trim");
const overtime = document.getElementById("timer-overtime");
const timerNumbers = document.getElementById("timer-numbers");
const timerBadge = document.getElementById("timer-badge");
const sound = document.getElementById("alert-sound");
const flash = document.getElementById("alert-flash");
const notify = document.getElementById("alert-notify");
const chimeSelect = document.getElementById("chime-select");
const chimeVolume = document.getElementById("chime-volume");
const chimePreview = document.getElementById("chime-preview");
const presetsList = document.getElementById("presets-list");
const presetH = document.getElementById("preset-h");
const presetM = document.getElementById("preset-m");
const presetS = document.getElementById("preset-s");
const presetAdd = document.getElementById("preset-add");
const presetError = document.getElementById("preset-error");
const PRESET_CAP = 8;
let presets = []; // mirrors state.timerPresets — edited in place, then persisted

async function load() {
  const {
    clockStyle, clockFormat, clockSeconds, clockNumerals, clockDate,
    swHundredths, swTrim: swTrimVal,
    timerStyle, timerNumerals, timerBadge: badge, timerTrim, timerOvertime, timerPresets,
    chime, chimeVolume: vol,
    alerts,
  } = await syncGet({
    clockStyle: "digital",
    clockFormat: "24",
    clockSeconds: true,
    clockNumerals: true,
    clockDate: true,
    swHundredths: true,
    swTrim: false,
    timerStyle: "digital",
    timerNumerals: true,
    timerBadge: false,
    timerTrim: false,
    timerOvertime: false,
    timerPresets: [...TIMER_PRESETS],
    chime: CHIME_DEFAULT,
    chimeVolume: VOLUME_DEFAULT,
    alerts: { ...ALERT_DEFAULTS },
  });
  const a = { ...ALERT_DEFAULTS, ...alerts };
  for (const r of document.querySelectorAll('input[name="clockStyle"]')) r.checked = r.value === clockStyle;
  for (const r of document.querySelectorAll('input[name="clockFormat"]')) r.checked = r.value === clockFormat;
  for (const r of document.querySelectorAll('input[name="timerStyle"]')) r.checked = r.value === timerStyle;
  seconds.checked = clockSeconds;
  numbers.checked = clockNumerals;
  dateLine.checked = clockDate;
  hundredths.checked = swHundredths;
  swTrim.checked = swTrimVal;
  timerNumbers.checked = timerNumerals;
  timerBadge.checked = badge;
  trim.checked = timerTrim;
  overtime.checked = timerOvertime;
  sound.checked = a.sound;
  flash.checked = a.flash;
  notify.checked = a.notify;
  chimeSelect.value = chime;
  chimeVolume.value = String(Math.round(vol * 100));
  presets = Array.isArray(timerPresets) && timerPresets.length ? [...timerPresets] : [...TIMER_PRESETS];
  renderPresets();
}

const saveAlerts = () =>
  syncSet({ alerts: { sound: sound.checked, flash: flash.checked, notify: notify.checked } });

for (const r of document.querySelectorAll('input[name="clockStyle"]')) {
  r.addEventListener("change", () => r.checked && syncSet({ clockStyle: r.value }));
}
for (const r of document.querySelectorAll('input[name="clockFormat"]')) {
  r.addEventListener("change", () => r.checked && syncSet({ clockFormat: r.value }));
}
for (const r of document.querySelectorAll('input[name="timerStyle"]')) {
  r.addEventListener("change", () => r.checked && syncSet({ timerStyle: r.value }));
}
seconds.addEventListener("change", () => syncSet({ clockSeconds: seconds.checked }));
numbers.addEventListener("change", () => syncSet({ clockNumerals: numbers.checked }));
dateLine.addEventListener("change", () => syncSet({ clockDate: dateLine.checked }));
hundredths.addEventListener("change", () => syncSet({ swHundredths: hundredths.checked }));
swTrim.addEventListener("change", () => syncSet({ swTrim: swTrim.checked }));
timerNumbers.addEventListener("change", () => syncSet({ timerNumerals: timerNumbers.checked }));
timerBadge.addEventListener("change", () => syncSet({ timerBadge: timerBadge.checked }));
trim.addEventListener("change", () => syncSet({ timerTrim: trim.checked }));
overtime.addEventListener("change", () => syncSet({ timerOvertime: overtime.checked }));
sound.addEventListener("change", saveAlerts);
flash.addEventListener("change", saveAlerts);
notify.addEventListener("change", saveAlerts);

// ---- chime + volume -------------------------------------------------------
// Preview plays through a one-shot AudioContext (the click counts as the user
// gesture some engines require). Its volume tracks the slider live, so dragging
// while previewing reflects the new level on the next click.
let previewCtx = null;
chimeSelect.addEventListener("change", () => syncSet({ chime: chimeSelect.value }));
chimeVolume.addEventListener("change", () => {
  const v = Math.max(0, Math.min(1, (Number(chimeVolume.value) || 0) / 100));
  syncSet({ chimeVolume: v });
});
chimePreview.addEventListener("click", () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    previewCtx ||= new Ctx();
    previewCtx.resume?.();
    const v = Math.max(0, Math.min(1, (Number(chimeVolume.value) || 0) / 100));
    playChime(previewCtx, { chime: chimeSelect.value, volume: v });
  } catch {
    /* preview unavailable — the chime still rings at countdown end */
  }
});

// ---- quick presets editor -------------------------------------------------
function presetText(sec) {
  if (sec >= 3600 && sec % 3600 === 0) {
    const h = sec / 3600;
    return h === 1 ? t("presetHour") : `${h} h`;
  }
  if (sec >= 60 && sec % 60 === 0) return t("presetMin", String(sec / 60));
  // arbitrary durations — show MM:SS / H:MM:SS
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function showError(key) {
  presetError.textContent = key ? t(key) : "";
  presetError.classList.toggle("hidden", !key);
}

function renderPresets() {
  presetsList.replaceChildren();
  for (const sec of presets) {
    const li = document.createElement("li");
    li.className = "flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-100";
    const label = document.createElement("span");
    label.textContent = presetText(sec);
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "rounded-full p-0.5 text-slate-500 hover:bg-slate-300 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-white";
    rm.title = t("presetRemove");
    rm.setAttribute("aria-label", `${t("presetRemove")}: ${presetText(sec)}`);
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("class", "h-3.5 w-3.5");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("d", "M6 18 18 6M6 6l12 12");
    svg.append(path);
    rm.append(svg);
    rm.addEventListener("click", () => removePreset(sec));
    li.append(label, rm);
    presetsList.append(li);
  }
}

function persistPresets() {
  syncSet({ timerPresets: [...presets] });
}

function removePreset(sec) {
  presets = presets.filter((p) => p !== sec);
  showError(null);
  renderPresets();
  persistPresets();
}

function addPreset() {
  const ms = hmsToMs({
    h: Number(presetH.value) || 0,
    m: Number(presetM.value) || 0,
    s: Number(presetS.value) || 0,
  });
  const sec = Math.floor(ms / 1000);
  if (sec <= 0) return; // empty input — silent
  if (presets.length >= PRESET_CAP) {
    showError("presetTooMany");
    return;
  }
  if (presets.includes(sec)) {
    showError("presetDuplicate");
    return;
  }
  presets = [...presets, sec].sort((a, b) => a - b);
  presetH.value = presetM.value = presetS.value = "";
  showError(null);
  renderPresets();
  persistPresets();
  presetH.focus();
}

presetAdd.addEventListener("click", addPreset);
for (const f of [presetH, presetM, presetS]) {
  f.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPreset();
    }
  });
}

// Sync across devices (opt-in). Toggling migrates the synced preferences, then we
// reload so the page reflects the now-active storage area.
const syncToggleEl = document.getElementById("syncToggle");
syncToggleEl.addEventListener("change", async (e) => {
  const on = e.target.checked;
  try {
    await setSyncEnabled(on);
    location.reload();
  } catch (err) {
    e.target.checked = !on; // revert (e.g. over the sync quota)
    console.error(t("optSyncErr", String(err?.message || err)));
  }
});

load();
(async () => {
  syncToggleEl.checked = await isSyncOn();
})();
