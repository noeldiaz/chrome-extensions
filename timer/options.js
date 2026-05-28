import { localize, t } from "./i18n.js";
import { initTheme } from "./theme.js";
import { ALERT_DEFAULTS } from "./lib.js";
import { isSyncOn, setSyncEnabled, syncGet, syncSet } from "./sync.js";

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

async function load() {
  const { clockStyle, clockFormat, clockSeconds, clockNumerals, clockDate, swHundredths, swTrim: swTrimVal, timerStyle, timerNumerals, timerBadge: badge, timerTrim, timerOvertime, alerts } = await syncGet({
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
