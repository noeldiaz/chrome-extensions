import { baseDomain, hostFromUrl, normalizeDomain, domainAllowed, addDomain, removeDomain } from "./lib.js";
import { localize, t } from "./i18n.js";
import { syncGet, syncSet, isSyncOn } from "./sync.js";
import { confirmDialog } from "./dialog.js";
import { pinPad } from "./pinpad.js";

const HOST_PERMS = { origins: ["http://*/*", "https://*/*"] };

const themeToggleEl = document.getElementById("theme-toggle");
const moonIconEl = document.getElementById("moon-icon");
const sunIconEl = document.getElementById("sun-icon");
const statusEl = document.getElementById("status");
const toggleEl = document.getElementById("toggleBlock");
const toggleLabelEl = document.getElementById("toggleLabel");
const thisSiteEl = document.getElementById("thisSite");
const allowThisEl = document.getElementById("allowThis");
const thisCardEl = document.getElementById("thisCard");
const settingsBtnEl = document.getElementById("settings");
const addFormEl = document.getElementById("addForm");
const addInputEl = document.getElementById("addInput");
const addBtnEl = document.getElementById("addBtn");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const clearAllEl = document.getElementById("clearAll");
const allowedCountEl = document.getElementById("allowedCount");

const TOGGLE_OFF = ["bg-blue-600", "text-white", "hover:bg-blue-700", "focus:ring-blue-400"];
const TOGGLE_ON = ["bg-red-600", "text-white", "hover:bg-red-700", "focus:ring-red-400"];

let currentBase = null; // base domain of the active tab, or null (non-http page)
let blockingNow = false; // last-rendered blocking state; lets the toggle branch
//                          synchronously so permissions.request stays the first
//                          await inside the click gesture (Chrome requires it).

// --- theme (Blocker has no shared theme module, so it's inlined like the popup) ---

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

async function toggleTheme() {
  const isDark = !document.documentElement.classList.contains("dark");
  applyTheme(isDark);
  await chrome.storage.local.set({ theme: isDark ? "dark" : "light" });
}

// --- helpers ---

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getBlocking() {
  const { blocking = false } = await chrome.storage.local.get({ blocking: false });
  return blocking;
}

async function getAllowed() {
  const { allowed = [] } = await syncGet({ allowed: [] });
  return allowed;
}

// --- render ---

function renderControl(blocking, allowed) {
  blockingNow = blocking;
  toggleEl.classList.remove(...TOGGLE_OFF, ...TOGGLE_ON);
  toggleEl.classList.add(...(blocking ? TOGGLE_ON : TOGGLE_OFF));
  toggleLabelEl.textContent = blocking ? t("stopBlocking") : t("startBlocking");

  // While blocking, hide the "allow this tab" card — you set the allowlist
  // before starting, and the Allowed tab still manages it.
  thisCardEl.classList.toggle("hidden", blocking);

  // While blocking, the Options page is off limits too (locked behind the PIN).
  settingsBtnEl.disabled = blocking;

  const allowed_ = currentBase ? domainAllowed(currentBase, allowed) : false;
  thisSiteEl.textContent = currentBase || t("noSiteHere");
  allowThisEl.disabled = !currentBase || allowed_;
  const allowLabel = allowed_ ? t("alreadyAllowed") : t("allowThisSite");
  allowThisEl.title = allowLabel;
  allowThisEl.setAttribute("aria-label", allowLabel);
}

function buildRow(domain, blocking) {
  const row = document.createElement("div");
  row.className =
    "flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800";

  const name = document.createElement("span");
  name.className = "truncate text-sm text-slate-800 dark:text-slate-100";
  name.textContent = domain;
  name.title = domain;

  const del = document.createElement("button");
  del.type = "button";
  del.disabled = blocking; // read-only while blocking
  del.className =
    "shrink-0 rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-red-950";
  del.title = t("removeSite", [domain]);
  del.setAttribute("aria-label", t("removeSite", [domain]));
  del.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>';
  del.addEventListener("click", () => removeOne(domain));

  row.append(name, del);
  return row;
}

async function render() {
  const [blocking, allowed] = await Promise.all([getBlocking(), getAllowed()]);
  renderControl(blocking, allowed);

  allowedCountEl.textContent = String(allowed.length);
  allowedCountEl.classList.toggle("hidden", allowed.length === 0);

  // While blocking, the allowlist is read-only: no Add, Remove, or Clear all.
  addInputEl.disabled = blocking;
  addBtnEl.disabled = blocking;

  listEl.replaceChildren();
  emptyEl.hidden = allowed.length > 0;
  clearAllEl.disabled = blocking || allowed.length === 0;
  for (const d of allowed) listEl.appendChild(buildRow(d, blocking));
}

// --- actions ---

// SHA-256 hex of the PIN (with a fixed salt) so it isn't stored in the clear.
// crypto.subtle is available on extension pages (secure context).
async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("blocker-pin:" + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function startBlocking() {
  // chrome.permissions.request must be the first await inside the user gesture.
  const granted = await chrome.permissions.request(HOST_PERMS);
  if (!granted) {
    statusEl.textContent = t("needsAccess");
    return;
  }
  statusEl.textContent = "";
  // Choose an unlock PIN before blocking starts; it's required to stop later.
  const pin = await pinPad({
    mode: "set",
    title: t("pinSetTitle"),
    subtitle: t("pinSetSubtitle"),
    confirmTitle: t("pinConfirmTitle"),
    confirmSubtitle: t("pinConfirmSubtitle"),
    mismatch: t("pinMismatch"),
    cancelLabel: t("cancel"),
    backspaceLabel: t("pinBackspace"),
  });
  if (!pin) return; // cancelled — leave blocking off
  const allowed = await getAllowed();
  const next = currentBase ? addDomain(allowed, currentBase) : allowed;
  if (next !== allowed) await syncSet({ allowed: next });
  await chrome.storage.local.set({ blocking: true, pinHash: await hashPin(pin) });
  await render();
}

async function stopBlocking() {
  // Require the unlock PIN (when one was set) before turning blocking off.
  const { pinHash = null } = await chrome.storage.local.get({ pinHash: null });
  if (pinHash) {
    const pin = await pinPad({
      mode: "enter",
      title: t("pinEnterTitle"),
      subtitle: t("pinEnterSubtitle"),
      wrong: t("pinWrong"),
      cancelLabel: t("cancel"),
      backspaceLabel: t("pinBackspace"),
      verify: async (entered) => (await hashPin(entered)) === pinHash,
    });
    if (!pin) return; // cancelled or never verified — stay blocked
  }
  await chrome.storage.local.set({ blocking: false });
  await chrome.storage.local.remove("pinHash");
  statusEl.textContent = "";
  await render();
}

function toggleBlocking() {
  // Branch on the last-rendered state (no await first) so that, when starting,
  // chrome.permissions.request is the first await under the user gesture.
  return blockingNow ? stopBlocking() : startBlocking();
}

async function allowThisSite() {
  if (blockingNow || !currentBase) return;
  const allowed = await getAllowed();
  await syncSet({ allowed: addDomain(allowed, currentBase) });
  await render();
}

async function addManual(e) {
  e.preventDefault();
  if (blockingNow) return; // read-only while blocking
  const domain = normalizeDomain(addInputEl.value);
  if (!domain) {
    statusEl.textContent = t("invalidDomain");
    return;
  }
  statusEl.textContent = "";
  const allowed = await getAllowed();
  await syncSet({ allowed: addDomain(allowed, domain) });
  addInputEl.value = "";
  await render();
}

async function removeOne(domain) {
  if (blockingNow) return; // read-only while blocking
  const ok = await confirmDialog({
    title: t("removeTitle"),
    body: t("removeBody", [domain]),
    confirmLabel: t("remove"),
    cancelLabel: t("cancel"),
  });
  if (!ok) return;
  const allowed = await getAllowed();
  await syncSet({ allowed: removeDomain(allowed, domain) });
  await render();
}

async function clearAll() {
  if (blockingNow) return; // read-only while blocking
  const allowed = await getAllowed();
  if (!allowed.length) return;
  const ok = await confirmDialog({
    title: t("clearTitle"),
    body: t("clearBody", [String(allowed.length)]),
    confirmLabel: t("clearAll"),
    cancelLabel: t("cancel"),
  });
  if (!ok) return;
  await syncSet({ allowed: [] });
  await render();
}

// --- wiring ---

const tabBtns = document.querySelectorAll(".tab-btn");
const panels = { control: document.getElementById("panel-control"), allowed: document.getElementById("panel-allowed") };
for (const b of tabBtns)
  b.addEventListener("click", () => {
    for (const x of tabBtns) x.classList.toggle("is-active", x === b);
    for (const [k, p] of Object.entries(panels)) p.classList.toggle("hidden", k !== b.dataset.tab);
  });

themeToggleEl.addEventListener("click", toggleTheme);
settingsBtnEl.addEventListener("click", () => {
  if (blockingNow) return; // Options are locked while blocking
  chrome.runtime.openOptionsPage();
});
toggleEl.addEventListener("click", toggleBlocking);
allowThisEl.addEventListener("click", allowThisSite);
addFormEl.addEventListener("submit", addManual);
clearAllEl.addEventListener("click", clearAll);

// Live-refresh when blocking flips or the allowlist changes (incl. from another
// signed-in device while sync is the active area).
chrome.storage.onChanged.addListener(async (changes, area) => {
  if ((area === "local" && (changes.blocking || changes.allowed)) || (area === "sync" && changes.allowed && (await isSyncOn()))) {
    await render();
  }
});

async function load() {
  const tab = await activeTab();
  const host = hostFromUrl(tab?.url || "");
  currentBase = host ? baseDomain(host) : null;
  await render();
}

localize();
loadTheme();
load();
