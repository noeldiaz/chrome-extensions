// Blocker options page. Carries the "Sync across devices" toggle plus the same
// light/dark theme wiring the popup uses (Blocker has no shared theme module,
// so it's inlined here) and localization.

import { localize, t } from "./i18n.js";
import { isSyncOn, setSyncEnabled } from "./sync.js";
import { downloadBackup, parseBackup, restoreBackup } from "./backup.js";
import { confirmDialog } from "./dialog.js";

const APP = "blocker";

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

// Backup & restore: export everything to a JSON file, or import one to restore
// it (replacing what's here now) — confirmed first, since it's destructive.
const backupStatusEl = document.getElementById("backupStatus");
function backupFlash(msg, ok = true) {
  backupStatusEl.textContent = msg;
  backupStatusEl.classList.toggle("text-red-500", !ok);
  backupStatusEl.classList.toggle("dark:text-red-400", !ok);
}

document.getElementById("exportBtn").addEventListener("click", async () => {
  try {
    await downloadBackup(APP);
    backupFlash(t("backupExported"));
  } catch (err) {
    backupFlash(t("backupErr", String(err?.message || err)), false);
  }
});

const importFileEl = document.getElementById("importFile");
document.getElementById("importBtn").addEventListener("click", () => importFileEl.click());
importFileEl.addEventListener("change", async () => {
  const file = importFileEl.files?.[0];
  importFileEl.value = ""; // let the same file be re-picked later
  if (!file) return;
  let data;
  try {
    data = parseBackup(await file.text(), APP); // err.message is an i18n key
  } catch (err) {
    backupFlash(t(err.message), false);
    return;
  }
  const ok = await confirmDialog({
    title: t("importTitle"),
    body: t("importBody"),
    confirmLabel: t("importConfirm"),
    cancelLabel: t("cancel"),
  });
  if (!ok) return;
  try {
    await restoreBackup(data);
    location.reload();
  } catch (err) {
    backupFlash(t("backupErr", String(err?.message || err)), false);
  }
});

localize();
loadTheme();
(async () => {
  syncToggleEl.checked = await isSyncOn();
})();
