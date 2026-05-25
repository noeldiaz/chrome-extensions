import { initTheme } from "./theme.js";
import { localize, t } from "./i18n.js";
import { isSyncOn, setSyncEnabled } from "./sync.js";
import { downloadBackup, parseBackup, restoreBackup } from "./backup.js";
import { confirmDialog } from "./dialog.js";
import * as idb from "./idb.js"; // backup adapter: saved logos + created-codes history

const $ = (id) => document.getElementById(id);
const APP = "qrmaker";

// QRmaker options page. Shares the theme + localization wiring used by the rest
// of the extension; the one setting so far is the opt-in cross-device sync.
localize();
initTheme({ toggle: $("theme-toggle"), moon: $("moon-icon"), sun: $("sun-icon") });

// Sync across devices (opt-in). Toggling migrates the synced presets, then we
// reload so the page reflects the now-active storage area.
(async () => {
  $("syncToggle").checked = await isSyncOn();
})();
$("syncToggle").addEventListener("change", async (e) => {
  const on = e.target.checked;
  try {
    await setSyncEnabled(on);
    location.reload();
  } catch (err) {
    e.target.checked = !on; // revert (e.g. over the sync quota)
    // eslint-disable-next-line no-console -- no on-page status element here yet
    console.error(t("optSyncErr", String(err?.message || err)));
  }
});

// Tabs: Settings / About
$("aboutVersion").textContent = `${t("version")} ${chrome.runtime.getManifest().version}`;
const opanels = { settings: $("opanel-settings"), about: $("opanel-about") };
const tabBtns = document.querySelectorAll(".tab-btn");
for (const b of tabBtns)
  b.addEventListener("click", () => {
    for (const x of tabBtns) x.classList.toggle("is-active", x === b);
    for (const [k, p] of Object.entries(opanels)) p.classList.toggle("hidden", k !== b.dataset.tab);
  });

// Backup & restore: export everything (settings + saved logos + history) to a
// JSON file, or import one to restore it (replacing what's here now) — confirmed
// first, since it's destructive.
function backupFlash(msg, ok = true) {
  const el = $("backupStatus");
  el.textContent = msg;
  el.classList.toggle("text-red-500", !ok);
  el.classList.toggle("dark:text-red-400", !ok);
}

$("exportBtn").addEventListener("click", async () => {
  try {
    await downloadBackup(APP, idb);
    backupFlash(t("backupExported"));
  } catch (err) {
    backupFlash(t("backupErr", String(err?.message || err)), false);
  }
});

$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async () => {
  const input = $("importFile");
  const file = input.files?.[0];
  input.value = ""; // let the same file be re-picked later
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
    await restoreBackup(data, idb);
    location.reload();
  } catch (err) {
    backupFlash(t("backupErr", String(err?.message || err)), false);
  }
});

// Footer Close: shut this options tab (window.close is unreliable for a tab, so
// remove it by id, falling back if needed).
$("winClose").addEventListener("click", async () => {
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
