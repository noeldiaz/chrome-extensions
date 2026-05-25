// Blocker options page. Carries the "Sync across devices" toggle plus the same
// light/dark theme wiring the popup uses (Blocker has no shared theme module,
// so it's inlined here) and localization.

import { localize, t } from "./i18n.js";
import { isSyncOn, setSyncEnabled } from "./sync.js";

const themeToggleEl = document.getElementById("theme-toggle");
const moonIconEl = document.getElementById("moon-icon");
const sunIconEl = document.getElementById("sun-icon");

const osThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  moonIconEl.classList.toggle("hidden", isDark);
  sunIconEl.classList.toggle("hidden", !isDark);
  document.body.classList.remove("invisible");
}

async function loadTheme() {
  const { theme } = await chrome.storage.local.get({ theme: null });
  applyTheme(theme === "dark" || (theme == null && osThemeMedia.matches));
}

osThemeMedia.addEventListener("change", async (e) => {
  const { theme } = await chrome.storage.local.get({ theme: null });
  if (theme == null) applyTheme(e.matches);
});

themeToggleEl.addEventListener("click", async () => {
  const isDark = !document.documentElement.classList.contains("dark");
  applyTheme(isDark);
  await chrome.storage.local.set({ theme: isDark ? "dark" : "light" });
});

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

// Tabs: Settings / About
document.getElementById("aboutVersion").textContent = `${t("version")} ${chrome.runtime.getManifest().version}`;
const opanels = { settings: document.getElementById("opanel-settings"), about: document.getElementById("opanel-about") };
const tabBtns = document.querySelectorAll(".tab-btn");
for (const b of tabBtns)
  b.addEventListener("click", () => {
    for (const x of tabBtns) x.classList.toggle("is-active", x === b);
    for (const [k, p] of Object.entries(opanels)) p.classList.toggle("hidden", k !== b.dataset.tab);
  });

// Sync across devices (opt-in). Toggling migrates the synced allowlist, then we
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

localize();
loadTheme();
(async () => {
  syncToggleEl.checked = await isSyncOn();
})();
