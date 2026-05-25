import { loadTheme, wireTheme } from "./theme.js";
import { localize, t } from "./i18n.js";
import { isValidHttpUrl } from "./lib.js";
import { syncGet, syncSet, isSyncOn, setSyncEnabled } from "./sync.js";
import { downloadBackup, parseBackup, restoreBackup } from "./backup.js";
import { confirmDialog } from "./dialog.js";

const APP = "screener";

const endpointEl = document.getElementById("endpoint");
const tokenEl = document.getElementById("token");
const saveEl = document.getElementById("save");
const statusEl = document.getElementById("status");
const syncToggleEl = document.getElementById("syncToggle");

let statusTimer = null;
function flash(message, ok = true) {
  statusEl.textContent = message;
  statusEl.classList.toggle("text-green-600", ok);
  statusEl.classList.toggle("dark:text-green-400", ok);
  statusEl.classList.toggle("text-red-500", !ok);
  statusEl.classList.toggle("dark:text-red-400", !ok);
  clearTimeout(statusTimer);
  if (ok) statusTimer = setTimeout(() => (statusEl.textContent = ""), 2500);
}

// http to a non-local host sends the bearer token in cleartext.
function isInsecure(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && !/^(localhost|127\.|\[?::1)/.test(u.hostname);
  } catch {
    return false;
  }
}

async function save() {
  const endpoint = endpointEl.value.trim();
  const token = tokenEl.value.trim();
  if (endpoint && !isValidHttpUrl(endpoint)) {
    flash(t("enterValidUrl"), false);
    return;
  }
  await syncSet({ endpoint, token });
  if (token && isInsecure(endpoint)) {
    flash(t("savedInsecure"), false);
  } else {
    flash(t("saved"));
  }
}

async function load() {
  const { endpoint, token } = await syncGet({ endpoint: "", token: "" });
  endpointEl.value = endpoint;
  tokenEl.value = token;
}

// Sync across devices (opt-in). Toggling migrates the synced data, then we
// reload so every field reflects the now-active storage area.
async function initSync() {
  syncToggleEl.checked = await isSyncOn();
  syncToggleEl.addEventListener("change", async (e) => {
    const on = e.target.checked;
    try {
      await setSyncEnabled(on);
      location.reload();
    } catch (err) {
      e.target.checked = !on; // revert (e.g. over the sync quota)
      flash(t("optSyncErr", String(err?.message || err)), false);
    }
  });
}

saveEl.addEventListener("click", save);
for (const el of [endpointEl, tokenEl]) {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  });
}

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

// Tabs: Settings / Tickets / About
document.getElementById("aboutVersion").textContent = `${t("version")} ${chrome.runtime.getManifest().version}`;
const opanels = {
  settings: document.getElementById("opanel-settings"),
  tickets: document.getElementById("opanel-tickets"),
  about: document.getElementById("opanel-about"),
};
const tabBtns = document.querySelectorAll(".tab-btn");
for (const b of tabBtns)
  b.addEventListener("click", () => {
    for (const x of tabBtns) x.classList.toggle("is-active", x === b);
    for (const [k, p] of Object.entries(opanels)) p.classList.toggle("hidden", k !== b.dataset.tab);
  });

// Backup & restore: export everything to a JSON file, or import one to restore
// it (replacing what's here now) — confirmed first, since it's destructive.
// Transient captures live in IndexedDB and aren't part of the backup.
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
wireTheme(document.getElementById("theme-toggle"));
loadTheme();
initSync();
load();
