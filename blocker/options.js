// Blocker options page. Carries the "Sync across devices" toggle plus the same
// light/dark theme wiring the popup uses (Blocker has no shared theme module,
// so it's inlined here) and localization.

import { localize, t } from "./i18n.js";
import { syncGet, syncSet, isSyncOn, setSyncEnabled } from "./sync.js";
import { downloadBackup, parseBackup, restoreBackup } from "./backup.js";
import { confirmDialog } from "./dialog.js";
import { normalizeRule, addDomain, removeDomain, effectiveAllowed, buildPolicyReg } from "./lib.js";
import { pinPad } from "./pinpad.js";
import { hashPin } from "./pin.js";

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

// Master PIN: an override that always stops blocking, set ahead of time, in case
// someone locks the extension with a PIN you don't know. Stored hashed, local
// only. Uses the current PIN-length preference; its own length rides along.
const masterStatusEl = document.getElementById("masterStatus");
const setMasterEl = document.getElementById("setMaster");
const setMasterLabelEl = document.getElementById("setMasterLabel");
const removeMasterEl = document.getElementById("removeMaster");

async function renderMaster() {
  const { masterPinHash = null } = await chrome.storage.local.get({ masterPinHash: null });
  const isSet = !!masterPinHash;
  masterStatusEl.textContent = isSet ? t("masterSet") : t("masterNotSet");
  setMasterLabelEl.textContent = isSet ? t("masterChangeBtn") : t("masterSetBtn");
  removeMasterEl.classList.toggle("hidden", !isSet);
}

// Once a master PIN is set, it can only be changed or removed by entering it —
// so nobody can quietly swap or clear someone else's override. Returns true when
// there's no master yet (nothing to verify) or the entered PIN matches.
async function verifyMaster() {
  const { masterPinHash = null, masterPinDigits = 4 } = await chrome.storage.local.get({
    masterPinHash: null,
    masterPinDigits: 4,
  });
  if (!masterPinHash) return true;
  const pin = await pinPad({
    mode: "enter",
    length: masterPinDigits,
    title: t("masterVerifyTitle"),
    subtitle: t("masterVerifySubtitle"),
    wrong: t("pinWrong"),
    cancelLabel: t("cancel"),
    backspaceLabel: t("pinBackspace"),
    verify: async (entered) => (await hashPin(entered)) === masterPinHash,
  });
  return !!pin;
}

setMasterEl.addEventListener("click", async () => {
  if (!(await verifyMaster())) return; // changing requires the current master PIN
  const { pinLength = 4 } = await chrome.storage.local.get({ pinLength: 4 });
  const pin = await pinPad({
    mode: "set",
    length: pinLength,
    title: t("masterSetTitle"),
    subtitle: t("masterSetSubtitle"),
    confirmTitle: t("pinConfirmTitle"),
    confirmSubtitle: t("pinConfirmSubtitle"),
    mismatch: t("pinMismatch"),
    cancelLabel: t("cancel"),
    backspaceLabel: t("pinBackspace"),
  });
  if (!pin) return;
  await chrome.storage.local.set({ masterPinHash: await hashPin(pin), masterPinDigits: pin.length });
  await renderMaster();
});

removeMasterEl.addEventListener("click", async () => {
  if (!(await verifyMaster())) return; // removing requires the current master PIN
  await chrome.storage.local.remove(["masterPinHash", "masterPinDigits"]);
  await renderMaster();
});

// Block page message (optional). Autosaved as the user types; empty clears it so
// the block page falls back to the default. An admin's managed message overrides
// this on the block page.
const blockMsgEl = document.getElementById("blockMessage");
const blockMsgDetailsEl = document.getElementById("blockMsgDetails");
const blockMsgStatusEl = document.getElementById("blockMsgStatus");
let blockMsgTimer = null;
blockMsgEl.addEventListener("input", () => {
  clearTimeout(blockMsgTimer);
  blockMsgTimer = setTimeout(async () => {
    const v = blockMsgEl.value.trim();
    if (v) await chrome.storage.local.set({ blockMessage: v });
    else await chrome.storage.local.remove("blockMessage");
    blockMsgStatusEl.textContent = t("blockMsgSaved");
    setTimeout(() => (blockMsgStatusEl.textContent = ""), 1500);
  }, 400);
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

// --- Activity log: session events (audit trail) + blocked attempts, merged into
// one newest-first timeline. Read-only; clearable; exportable to CSV. ---
const logListEl = document.getElementById("logList");
const logEmptyEl = document.getElementById("logEmpty");
const logCountEl = document.getElementById("logCount");
const clearLogEl = document.getElementById("clearLog");
const exportLogEl = document.getElementById("exportLog");

// A human label for an audit event (its `detail` carries minutes / "master").
function eventLabel(e) {
  switch (e.type) {
    case "start":
      return e.detail ? t("evtStartTimed", [e.detail]) : t("evtStart");
    case "stop":
      return e.detail === "master" ? t("evtStopMaster") : t("evtStop");
    case "expire":
      return t("evtExpire");
    default:
      return e.type;
  }
}

// Merge both logs into one newest-first list of { kind, ts, text }.
async function getActivity() {
  const { blockedLog = [], auditLog = [] } = await chrome.storage.local.get({ blockedLog: [], auditLog: [] });
  return [
    ...blockedLog.map((e) => ({ kind: "block", ts: e.ts, text: e.host })),
    ...auditLog.map((e) => ({ kind: "event", ts: e.ts, text: eventLabel(e) })),
  ].sort((a, b) => b.ts - a.ts);
}

function buildLogRow(row) {
  const el = document.createElement("div");
  el.className =
    "flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800";
  const left = document.createElement("span");
  left.className = "flex min-w-0 items-center gap-2";
  const dot = document.createElement("span");
  // red = a blocked attempt; slate = a session event
  dot.className = `h-1.5 w-1.5 shrink-0 rounded-full ${row.kind === "block" ? "bg-red-500" : "bg-slate-400 dark:bg-slate-500"}`;
  const text = document.createElement("span");
  text.className = "truncate text-sm text-slate-800 dark:text-slate-100";
  text.textContent = row.text;
  text.title = row.text;
  left.append(dot, text);
  const time = document.createElement("span");
  time.className = "shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500";
  time.textContent = new Date(row.ts).toLocaleString();
  el.append(left, time);
  return el;
}

async function renderLog() {
  const rows = await getActivity();
  logCountEl.textContent = String(rows.length);
  logCountEl.classList.toggle("hidden", rows.length === 0);
  logEmptyEl.hidden = rows.length > 0;
  clearLogEl.disabled = rows.length === 0;
  exportLogEl.disabled = rows.length === 0;
  logListEl.replaceChildren(...rows.map(buildLogRow));
}

// CSV for proctor records: Time (ISO), Kind, Detail.
function logCsv(rows) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["Time", "Kind", "Detail"].map(esc).join(",")];
  for (const r of rows)
    lines.push(
      [new Date(r.ts).toISOString(), r.kind === "block" ? t("logKindBlocked") : t("logKindSession"), r.text]
        .map(esc)
        .join(","),
    );
  return lines.join("\r\n");
}

exportLogEl.addEventListener("click", async () => {
  const rows = await getActivity();
  if (!rows.length) return;
  const blob = new Blob([logCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${APP}-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

clearLogEl.addEventListener("click", async () => {
  const rows = await getActivity();
  if (!rows.length) return;
  const ok = await confirmDialog({
    title: t("clearLogTitle"),
    body: t("clearLogBody"),
    confirmLabel: t("clearLog"),
    cancelLabel: t("cancel"),
  });
  if (!ok) return;
  await chrome.storage.local.set({ blockedLog: [], auditLog: [] });
  await renderLog();
});

// Keep the log fresh if events/attempts are recorded while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.blockedLog || changes.auditLog)) renderLog();
});

// --- Allowed list (add / remove; mirrors the popup, honors admin-locked sites) ---
const addFormEl = document.getElementById("addForm");
const addInputEl = document.getElementById("addInput");
const addBtnEl = document.getElementById("addBtn");
const allowListEl = document.getElementById("list");
const allowEmptyEl = document.getElementById("empty");
const allowCountEl = document.getElementById("allowedCount");
const clearAllEl = document.getElementById("clearAll");
const bulkInputEl = document.getElementById("bulkInput");
const bulkBtnEl = document.getElementById("bulkBtn");
const bulkStatusEl = document.getElementById("bulkStatus");
const genPolicyBtnEl = document.getElementById("genPolicyBtn");
const genPolicyStatusEl = document.getElementById("genPolicyStatus");

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
  bulkInputEl.disabled = locked;
  bulkBtnEl.disabled = locked;
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

// Bulk add: split on whitespace/commas, normalize each, add the valid ones.
async function bulkAdd() {
  if (managedAllow.lockAllowlist) return;
  const tokens = bulkInputEl.value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tokens.length) return;
  let { allowed = [] } = await syncGet({ allowed: [] });
  let added = 0;
  let invalid = 0;
  for (const tok of tokens) {
    const d = normalizeRule(tok);
    if (!d) {
      invalid++;
      continue;
    }
    const next = addDomain(allowed, d);
    if (next.length !== allowed.length) added++; // not a duplicate
    allowed = next;
  }
  await syncSet({ allowed });
  bulkInputEl.value = "";
  bulkStatusEl.textContent = t("bulkAddResult", [String(added), String(invalid)]);
  await renderAllowed();
}

// Generate a Windows .reg locking managed machines to the current allowlist
// (native URLAllowlist + Blocker's managed config for this extension id).
function downloadGeneratedPolicy(sites) {
  const today = new Date().toISOString().slice(0, 10);
  const reg = buildPolicyReg(sites, chrome.runtime.id, today);
  const blob = new Blob([reg], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${APP}-policy-${today}.reg`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

genPolicyBtnEl.addEventListener("click", async () => {
  const { allowed: userAllowed = [] } = await syncGet({ allowed: [] });
  const managedSites = (managedAllow.allowedSites || []).map((d) => String(d).toLowerCase());
  const sites = effectiveAllowed(managedSites, userAllowed, managedAllow.lockAllowlist);
  downloadGeneratedPolicy(sites);
  genPolicyStatusEl.textContent = t("policyGenerated");
  setTimeout(() => (genPolicyStatusEl.textContent = ""), 2000);
});

addFormEl.addEventListener("submit", addAllow);
clearAllEl.addEventListener("click", clearAllAllowed);
bulkBtnEl.addEventListener("click", bulkAdd);

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
    const { pinLength = 4, blockMessage = "" } = await chrome.storage.local.get({ pinLength: 4, blockMessage: "" });
    pinLengthEl.value = String(pinLength);
    blockMsgEl.value = blockMessage;
    if (blockMessage) blockMsgDetailsEl.open = true; // expand when a message is already set
    await renderMaster();
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
