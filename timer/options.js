import { localize } from "./i18n.js";
import { initTheme } from "./theme.js";
import { ALERT_DEFAULTS } from "./lib.js";

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

// tab switcher
const panels = { settings: document.getElementById("opanel-settings"), about: document.getElementById("opanel-about") };
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
const datefs = document.getElementById("clock-datefs");
const hundredths = document.getElementById("sw-hundredths");
const trim = document.getElementById("timer-trim");
const sound = document.getElementById("alert-sound");
const flash = document.getElementById("alert-flash");
const notify = document.getElementById("alert-notify");

async function load() {
  const { clockFormat, clockSeconds, clockDateFs, swHundredths, timerTrim, alerts } = await chrome.storage.local.get({
    clockFormat: "24",
    clockSeconds: true,
    clockDateFs: false,
    swHundredths: true,
    timerTrim: false,
    alerts: { ...ALERT_DEFAULTS },
  });
  const a = { ...ALERT_DEFAULTS, ...alerts };
  for (const r of document.querySelectorAll('input[name="clockFormat"]')) r.checked = r.value === clockFormat;
  seconds.checked = clockSeconds;
  datefs.checked = clockDateFs;
  hundredths.checked = swHundredths;
  trim.checked = timerTrim;
  sound.checked = a.sound;
  flash.checked = a.flash;
  notify.checked = a.notify;
}

const saveAlerts = () =>
  chrome.storage.local.set({ alerts: { sound: sound.checked, flash: flash.checked, notify: notify.checked } });

for (const r of document.querySelectorAll('input[name="clockFormat"]')) {
  r.addEventListener("change", () => r.checked && chrome.storage.local.set({ clockFormat: r.value }));
}
seconds.addEventListener("change", () => chrome.storage.local.set({ clockSeconds: seconds.checked }));
datefs.addEventListener("change", () => chrome.storage.local.set({ clockDateFs: datefs.checked }));
hundredths.addEventListener("change", () => chrome.storage.local.set({ swHundredths: hundredths.checked }));
trim.addEventListener("change", () => chrome.storage.local.set({ timerTrim: trim.checked }));
sound.addEventListener("change", saveAlerts);
flash.addEventListener("change", saveAlerts);
notify.addEventListener("change", saveAlerts);

load();
