// Blocker options page. Carries the "Sync across devices" toggle plus the same
// light/dark theme wiring the popup uses (Blocker has no shared theme module,
// so it's inlined here) and localization.

import { localize, t } from "./i18n.js";
import { syncGet, syncSet, isSyncOn, setSyncEnabled } from "./sync.js";
import { downloadBackup, parseBackup, restoreBackup } from "./backup.js";
import { confirmDialog } from "./dialog.js";
import { normalizeRule, addDomain, removeDomain, effectiveAllowed } from "./lib.js";

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

// Tabs: Settings / Log / About
document.getElementById("aboutVersion").textContent = `${t("version")} ${chrome.runtime.getManifest().version}`;
const opanels = {
  settings: document.getElementById("opanel-settings"),
  allowed: document.getElementById("opanel-allowed"),
  log: document.getElementById("opanel-log"),
  about: document.getElementById("opanel-about"),
};
const tabBtns = document.querySelectorAll(".tab-btn");
for (const b of tabBtns)
  b.addEventListener("click", () => {
    for (const x of tabBtns) x.classList.toggle("is-active", x === b);
    for (const [k, p] of Object.entries(opanels)) p.classList.toggle("hidden", k !== b.dataset.tab);
  });

// Unlock PIN length (4–8). A preference applied the next time blocking starts;
// the active PIN keeps the length it was set with.
const pinLengthEl = document.getElementById("pinLength");
pinLengthEl.addEventListener("change", async () => {
  await chrome.storage.local.set({ pinLength: parseInt(pinLengthEl.value, 10) || 4 });
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

// --- Blocked-attempt log (read-only history; clearable) ---
const logListEl = document.getElementById("logList");
const logEmptyEl = document.getElementById("logEmpty");
const logCountEl = document.getElementById("logCount");
const clearLogEl = document.getElementById("clearLog");

function buildLogRow(entry) {
  const row = document.createElement("div");
  row.className =
    "flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800";
  const host = document.createElement("span");
  host.className = "truncate text-sm text-slate-800 dark:text-slate-100";
  host.textContent = entry.host;
  host.title = entry.host;
  const time = document.createElement("span");
  time.className = "shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500";
  time.textContent = new Date(entry.ts).toLocaleString();
  row.append(host, time);
  return row;
}

async function renderLog() {
  const { blockedLog = [] } = await chrome.storage.local.get({ blockedLog: [] });
  logCountEl.textContent = String(blockedLog.length);
  logCountEl.classList.toggle("hidden", blockedLog.length === 0);
  logEmptyEl.hidden = blockedLog.length > 0;
  clearLogEl.disabled = blockedLog.length === 0;
  logListEl.replaceChildren(...blockedLog.map(buildLogRow));
}

clearLogEl.addEventListener("click", async () => {
  const { blockedLog = [] } = await chrome.storage.local.get({ blockedLog: [] });
  if (!blockedLog.length) return;
  const ok = await confirmDialog({
    title: t("clearLogTitle"),
    body: t("clearLogBody"),
    confirmLabel: t("clearLog"),
    cancelLabel: t("cancel"),
  });
  if (!ok) return;
  await chrome.storage.local.set({ blockedLog: [] });
  await renderLog();
});

// Keep the log fresh if attempts are recorded while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blockedLog) renderLog();
});

// --- Allowed list (add / remove; mirrors the popup, honors admin-locked sites) ---
const addFormEl = document.getElementById("addForm");
const addInputEl = document.getElementById("addInput");
const addBtnEl = document.getElementById("addBtn");
const allowListEl = document.getElementById("list");
const allowEmptyEl = document.getElementById("empty");
const allowCountEl = document.getElementById("allowedCount");
const clearAllEl = document.getElementById("clearAll");

let managedAllow = { allowedSites: [], lockAllowlist: false };
async function loadManagedAllow() {
  try {
    managedAllow = await chrome.storage.managed.get({ allowedSites: [], lockAllowlist: false });
  } catch {
    /* unmanaged */
  }
}

function buildAllowRow(domain, { removable, managed: isManaged }) {
  const row = document.createElement("div");
  row.className =
    "flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800";
  const name = document.createElement("span");
  name.className = "truncate text-sm text-slate-800 dark:text-slate-100";
  name.textContent = domain;
  name.title = domain;

  if (isManaged) {
    const lock = document.createElement("span");
    lock.className = "inline-flex shrink-0 items-center text-slate-400 dark:text-slate-500";
    lock.title = t("managedSite");
    lock.setAttribute("aria-label", t("managedSite"));
    lock.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>';
    row.append(name, lock);
    return row;
  }

  const del = document.createElement("button");
  del.type = "button";
  del.disabled = !removable;
  del.className =
    "shrink-0 rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-red-950";
  del.title = t("removeSite", [domain]);
  del.setAttribute("aria-label", t("removeSite", [domain]));
  del.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>';
  del.addEventListener("click", () => removeAllow(domain));
  row.append(name, del);
  return row;
}

async function renderAllowed() {
  const { allowed: userAllowed = [] } = await syncGet({ allowed: [] });
  const managedSites = (managedAllow.allowedSites || []).map((d) => String(d).toLowerCase());
  const managedSet = new Set(managedSites);
  const locked = !!managedAllow.lockAllowlist;
  const allowed = effectiveAllowed(managedSites, userAllowed, locked);

  allowCountEl.textContent = String(allowed.length);
  allowCountEl.classList.toggle("hidden", allowed.length === 0);

  addInputEl.disabled = locked;
  addBtnEl.disabled = locked;
  allowEmptyEl.hidden = allowed.length > 0;
  const userRemovable = allowed.filter((d) => !managedSet.has(d)).length;
  clearAllEl.disabled = locked || userRemovable === 0;

  allowListEl.replaceChildren(
    ...allowed.map((d) => buildAllowRow(d, { removable: !locked && !managedSet.has(d), managed: managedSet.has(d) })),
  );
}

async function addAllow(e) {
  e.preventDefault();
  if (managedAllow.lockAllowlist) return;
  const domain = normalizeRule(addInputEl.value);
  if (!domain) {
    addInputEl.focus();
    return;
  }
  const { allowed = [] } = await syncGet({ allowed: [] });
  await syncSet({ allowed: addDomain(allowed, domain) });
  addInputEl.value = "";
  await renderAllowed();
}

async function removeAllow(domain) {
  if (managedAllow.lockAllowlist) return;
  const ok = await confirmDialog({
    title: t("removeTitle"),
    body: t("removeBody", [domain]),
    confirmLabel: t("remove"),
    cancelLabel: t("cancel"),
  });
  if (!ok) return;
  const { allowed = [] } = await syncGet({ allowed: [] });
  await syncSet({ allowed: removeDomain(allowed, domain) });
  await renderAllowed();
}

async function clearAllAllowed() {
  if (managedAllow.lockAllowlist) return;
  const { allowed = [] } = await syncGet({ allowed: [] });
  if (!allowed.length) return;
  const ok = await confirmDialog({
    title: t("clearTitle"),
    body: t("clearBody", [String(allowed.length)]),
    confirmLabel: t("clearAll"),
    cancelLabel: t("cancel"),
  });
  if (!ok) return;
  await syncSet({ allowed: [] });
  await renderAllowed();
}

addFormEl.addEventListener("submit", addAllow);
clearAllEl.addEventListener("click", clearAllAllowed);

// Refresh when the allowlist changes here, from the popup, another device, or policy.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if ((area === "local" || area === "sync") && changes.allowed) await renderAllowed();
  if (area === "managed" && (changes.allowedSites || changes.lockAllowlist)) {
    await loadManagedAllow();
    await renderAllowed();
  }
});

localize();

// While blocking is on, the whole Options page is locked behind the PIN: show a
// notice instead of the settings (this also closes the door on using Import to
// reset the blocking flag). Stopping blocking happens in the popup.
async function init() {
  const { blocking = false } = await chrome.storage.local.get({ blocking: false });
  let forceBlocking = false;
  try {
    ({ forceBlocking = false } = await chrome.storage.managed.get({ forceBlocking: false }));
  } catch {
    /* unmanaged */
  }
  if (blocking || forceBlocking) {
    document.getElementById("lockNotice").classList.remove("hidden");
    document.getElementById("otabs").classList.add("hidden");
    for (const p of document.querySelectorAll(".tabpanel")) p.classList.add("hidden");
  }
  await loadTheme(); // removes `invisible` last, so locked content never flashes
  if (!blocking) {
    syncToggleEl.checked = await isSyncOn();
    const { pinLength = 4 } = await chrome.storage.local.get({ pinLength: 4 });
    pinLengthEl.value = String(pinLength);
    await loadManagedAllow();
    await renderAllowed();
  }
}
init();
renderLog();

// If blocking flips while this page is open (e.g. stopped from the popup),
// reload so the page locks or unlocks to match.
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "local" && changes.blocking) || (area === "managed" && changes.forceBlocking)) location.reload();
});
