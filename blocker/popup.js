import { baseDomain, hostFromUrl, normalizeRule, ruleMatches, addDomain, removeDomain, effectiveAllowed } from "./lib.js";
import { localize, t } from "./i18n.js";
import { syncGet, syncSet, isSyncOn } from "./sync.js";
import { confirmDialog } from "./dialog.js";
import { pinPad } from "./pinpad.js";
import { hashPin } from "./pin.js";
import { logEvent } from "./audit.js";

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
const durationRowEl = document.getElementById("durationRow");
const durationEl = document.getElementById("duration");
const countdownEl = document.getElementById("countdown");

const TOGGLE_OFF = ["bg-blue-600", "text-white", "hover:bg-blue-700", "focus:ring-blue-400"];
const TOGGLE_ON = ["bg-red-600", "text-white", "hover:bg-red-700", "focus:ring-red-400"];

let currentBase = null; // base domain of the active tab, or null (non-http page)
let currentUrl = null; // full URL of the active tab (for path-aware allow checks)
let countdownTimer = null; // setInterval id for the timed-session countdown
let blockingNow = false; // last-rendered blocking state; lets the toggle branch
//                          synchronously so permissions.request stays the first
//                          await inside the click gesture (Chrome requires it).

// Admin policy from chrome.storage.managed (Windows registry / GPO). Empty on an
// unmanaged machine. forceBlocking → can't stop; lockAllowlist → can't edit.
let managed = { allowedSites: [], forceBlocking: false, lockAllowlist: false };
async function loadManaged() {
  try {
    managed = await chrome.storage.managed.get({ allowedSites: [], forceBlocking: false, lockAllowlist: false });
  } catch {
    /* unmanaged — keep defaults */
  }
}

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

async function getAllowed() {
  const { allowed = [] } = await syncGet({ allowed: [] });
  return allowed;
}

// Show "Ends in mm:ss" for a timed session, ticking every second. Background's
// alarm flips blocking off at expiry, which re-renders us via storage.onChanged.
function manageCountdown(blocking, blockUntil) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (!blocking || !blockUntil) {
    countdownEl.classList.add("hidden");
    countdownEl.textContent = "";
    return;
  }
  const tick = () => {
    const ms = blockUntil - Date.now();
    if (ms <= 0) {
      countdownEl.classList.add("hidden");
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      return;
    }
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const parts = h > 0 ? [h, Math.floor((total % 3600) / 60), total % 60] : [Math.floor(total / 60), total % 60];
    const clock = parts.map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, "0"))).join(":");
    countdownEl.textContent = t("endsIn", clock);
    countdownEl.classList.remove("hidden");
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// --- render ---

function renderControl(blocking, allowed) {
  blockingNow = blocking;
  const forced = !!managed.forceBlocking;
  toggleEl.classList.remove(...TOGGLE_OFF, ...TOGGLE_ON);
  toggleEl.classList.add(...(blocking ? TOGGLE_ON : TOGGLE_OFF));
  // Admin force-blocking: blocking can't be turned off at all.
  toggleEl.disabled = forced;
  toggleLabelEl.textContent = forced ? t("lockedByAdmin") : blocking ? t("stopBlocking") : t("startBlocking");

  // While blocking, hide the "allow this tab" card — you set the allowlist
  // before starting, and the Allowed tab still manages it.
  thisCardEl.classList.toggle("hidden", blocking);
  // Session-length picker only makes sense before starting (and never when an
  // admin forces blocking on).
  durationRowEl.classList.toggle("hidden", blocking || forced);

  // While blocking, the Options page is off limits too (locked behind the PIN).
  settingsBtnEl.disabled = blocking;

  const allowed_ = currentUrl ? allowed.some((r) => ruleMatches(currentUrl, r)) : false;
  thisSiteEl.textContent = currentBase || t("noSiteHere");
  allowThisEl.disabled = !currentBase || allowed_;
  const allowLabel = allowed_ ? t("alreadyAllowed") : t("allowThisSite");
  allowThisEl.title = allowLabel;
  allowThisEl.setAttribute("aria-label", allowLabel);
}

function buildRow(domain, { removable = true, managed: isManaged = false } = {}) {
  const row = document.createElement("div");
  row.className =
    "flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800";

  const name = document.createElement("span");
  name.className = "truncate text-sm text-slate-800 dark:text-slate-100";
  name.textContent = domain;
  name.title = domain;

  // Admin-pushed sites can't be removed — show a lock badge instead of the ×.
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
  del.disabled = !removable; // read-only while blocking or locked
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
  const [{ blocking: blockingLocal = false, blockUntil = 0 }, userAllowed] = await Promise.all([
    chrome.storage.local.get({ blocking: false, blockUntil: 0 }),
    getAllowed(),
  ]);
  const blocking = blockingLocal || !!managed.forceBlocking;
  const managedSites = (managed.allowedSites || []).map((d) => String(d).toLowerCase());
  const managedSet = new Set(managedSites);
  const allowed = effectiveAllowed(managedSites, userAllowed, managed.lockAllowlist);

  renderControl(blocking, allowed);
  manageCountdown(blocking, blockUntil);

  allowedCountEl.textContent = String(allowed.length);
  allowedCountEl.classList.toggle("hidden", allowed.length === 0);

  // Read-only while blocking, or when the admin has locked the allowlist.
  const readOnly = blocking || !!managed.lockAllowlist;
  addInputEl.disabled = readOnly;
  addBtnEl.disabled = readOnly;

  listEl.replaceChildren();
  emptyEl.hidden = allowed.length > 0;
  // Clear all only affects the user's own entries (admin sites can't be removed).
  const userRemovable = allowed.filter((d) => !managedSet.has(d)).length;
  clearAllEl.disabled = readOnly || userRemovable === 0;
  for (const d of allowed)
    listEl.appendChild(buildRow(d, { removable: !readOnly && !managedSet.has(d), managed: managedSet.has(d) }));
}

// --- actions ---

async function startBlocking() {
  // chrome.permissions.request must be the first await inside the user gesture.
  const granted = await chrome.permissions.request(HOST_PERMS);
  if (!granted) {
    statusEl.textContent = t("needsAccess");
    return;
  }
  statusEl.textContent = "";
  // Choose an unlock PIN before blocking starts; it's required to stop later.
  // Length comes from the Options preference (4–8, default 4).
  const { pinLength = 4 } = await chrome.storage.local.get({ pinLength: 4 });
  const pin = await pinPad({
    mode: "set",
    length: pinLength,
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
  const minutes = parseInt(durationEl.value, 10) || 0;
  // Store the PIN's length so the stop prompt expects the right number of digits.
  await chrome.storage.local.set({ blocking: true, pinHash: await hashPin(pin), pinDigits: pin.length });
  // Timed session → store an end time (background sets the alarm); "until I stop"
  // → clear any leftover end time from a previous session.
  if (minutes > 0) await chrome.storage.local.set({ blockUntil: Date.now() + minutes * 60000 });
  else await chrome.storage.local.remove("blockUntil");
  await logEvent("start", minutes > 0 ? String(minutes) : ""); // audit trail
  await render();
}

async function stopBlocking() {
  // Require the unlock PIN (when one was set) before turning blocking off. The
  // master PIN (set ahead of time in Options) always works too, in case someone
  // locked the extension with a PIN you don't know. The keypad accepts either
  // length — verify runs as soon as enough digits are in.
  const {
    pinHash = null,
    pinDigits = 4,
    masterPinHash = null,
    masterPinDigits = 4,
  } = await chrome.storage.local.get({ pinHash: null, pinDigits: 4, masterPinHash: null, masterPinDigits: 4 });
  let usedMaster = false; // for the audit trail: which PIN unlocked the session
  if (pinHash) {
    const lengths = [pinDigits, ...(masterPinHash ? [masterPinDigits] : [])];
    const pin = await pinPad({
      mode: "enter",
      minLength: Math.min(...lengths),
      length: Math.max(...lengths),
      title: t("pinEnterTitle"),
      subtitle: t("pinEnterSubtitle"),
      wrong: t("pinWrong"),
      cancelLabel: t("cancel"),
      backspaceLabel: t("pinBackspace"),
      verify: async (entered) => {
        const h = await hashPin(entered);
        if (h === pinHash) return true;
        if (masterPinHash && h === masterPinHash) {
          usedMaster = true;
          return true;
        }
        return false;
      },
    });
    if (!pin) return; // cancelled or never verified — stay blocked
  }
  await chrome.storage.local.set({ blocking: false });
  await chrome.storage.local.remove(["pinHash", "pinDigits", "blockUntil"]);
  await logEvent("stop", usedMaster ? "master" : ""); // audit trail
  statusEl.textContent = "";
  await render();
}

function toggleBlocking() {
  if (managed.forceBlocking) return; // locked on by the administrator
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
  if (blockingNow || managed.lockAllowlist) return; // read-only while blocking or locked
  const domain = normalizeRule(addInputEl.value);
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
  if (blockingNow || managed.lockAllowlist) return; // read-only while blocking or locked
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
  if (blockingNow || managed.lockAllowlist) return; // read-only while blocking or locked
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
const panels = {
  control: document.getElementById("panel-control"),
  allowed: document.getElementById("panel-allowed"),
};
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

// Live-refresh when blocking flips, the session timer changes, the allowlist
// changes (incl. from another signed-in device while sync is the active area),
// or the admin policy changes.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "managed") {
    await loadManaged();
    await render();
    return;
  }
  if (
    (area === "local" && (changes.blocking || changes.blockUntil || changes.allowed)) ||
    (area === "sync" && changes.allowed && (await isSyncOn()))
  ) {
    await render();
  }
});

async function load() {
  const tab = await activeTab();
  currentUrl = tab?.url || null;
  const host = hostFromUrl(currentUrl || "");
  currentBase = host ? baseDomain(host) : null;
  await loadManaged();
  await render();
}

localize();
loadTheme();
load();
