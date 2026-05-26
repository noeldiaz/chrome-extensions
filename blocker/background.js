import { shouldBlock, isHttpUrl, hostFromUrl, effectiveAllowed } from "./lib.js";
import { syncGet } from "./sync.js";

const BLOCKED_PAGE = "blocked.html";
const BADGE_COLOR = "#dc2626"; // red-600 — blocking is active
const EXPIRY_ALARM = "blockExpiry"; // fires when a timed session ends
const LOG_CAP = 200; // most recent blocked attempts kept for proctor review

// Admin policy pushed via chrome.storage.managed (Windows registry / GPO). Empty
// when the machine is unmanaged. See schema.json + KIOSK.md.
async function managedPolicy() {
  try {
    return await chrome.storage.managed.get({ allowedSites: [], forceBlocking: false, lockAllowlist: false });
  } catch {
    return { allowedSites: [], forceBlocking: false, lockAllowlist: false };
  }
}

// Current effective settings. `blocking` is per-device (local) unless the admin
// forces it on; `allowed` merges the admin's locked list with the user's (the
// user's is dropped when the admin locks the allowlist).
async function state() {
  const policy = await managedPolicy();
  const { blocking = false } = await chrome.storage.local.get({ blocking: false });
  const { allowed: userAllowed = [] } = await syncGet({ allowed: [] });
  const allowed = effectiveAllowed(policy.allowedSites, userAllowed, policy.lockAllowlist);
  return { blocking: blocking || !!policy.forceBlocking, allowed };
}

function blockedUrl() {
  return chrome.runtime.getURL(BLOCKED_PAGE);
}

// Badge "ON" in red while blocking, cleared otherwise. The color setters aren't
// in every engine (Safari styles badges itself), so call them only when present.
async function setBadge(blocking) {
  await chrome.action.setBadgeText?.({ text: blocking ? "ON" : "" });
  if (blocking) {
    await chrome.action.setBadgeBackgroundColor?.({ color: BADGE_COLOR });
    await chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
  }
}

function redirect(tabId) {
  chrome.tabs.update(tabId, { url: blockedUrl() }).catch(() => {});
}

// Append a blocked attempt to a capped, newest-first local log (for a proctor to
// review). Collapses immediate repeats of the same host so one stubborn page
// doesn't flood the list. Local only — never synced.
async function logBlocked(url) {
  const host = hostFromUrl(url);
  if (!host) return;
  const { blockedLog = [] } = await chrome.storage.local.get({ blockedLog: [] });
  const last = blockedLog[0];
  if (last && last.host === host && Date.now() - last.ts < 2000) return;
  blockedLog.unshift({ host, ts: Date.now() });
  if (blockedLog.length > LOG_CAP) blockedLog.length = LOG_CAP;
  await chrome.storage.local.set({ blockedLog });
}

// Gate top-frame navigations. We read fresh state each time (cheap storage get)
// so a just-woken service worker never lets a navigation slip through with a
// stale in-memory cache. iframes/sub-resources are left alone.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!isHttpUrl(details.url)) return;
  const { blocking, allowed } = await state();
  if (shouldBlock(details.url, allowed, blocking)) {
    redirect(details.tabId);
    await logBlocked(details.url);
  }
});

// When blocking turns on, send already-open disallowed tabs to the block page,
// so enabling it actually restricts the current session (not just future nav).
async function sweepOpenTabs() {
  const { allowed } = await state();
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (tab.id != null && shouldBlock(tab.url || "", allowed, true)) {
      redirect(tab.id);
      await logBlocked(tab.url || "");
    }
  }
}

// End a timed session: turn blocking off and clear its PIN + expiry.
async function endSession() {
  await chrome.storage.local.set({ blocking: false });
  await chrome.storage.local.remove(["pinHash", "pinDigits", "blockUntil"]);
}

// Keep the expiry alarm in sync with a timed session. If the end time has
// already passed (e.g. the machine was asleep), end the session now.
async function syncExpiryAlarm() {
  const { blocking = false, blockUntil = 0 } = await chrome.storage.local.get({ blocking: false, blockUntil: 0 });
  if (blocking && blockUntil > Date.now()) {
    chrome.alarms.create(EXPIRY_ALARM, { when: blockUntil });
  } else {
    await chrome.alarms.clear(EXPIRY_ALARM);
    if (blocking && blockUntil && blockUntil <= Date.now()) await endSession();
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EXPIRY_ALARM) endSession();
});

// Re-badge and re-sweep whenever blocking flips, the allowlist changes, or the
// admin policy changes — so a removed site immediately kicks its open tabs and
// a forced/locked policy takes effect without a restart.
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local" && (changes.blocking || changes.blockUntil)) await syncExpiryAlarm();
  const relevant =
    (areaName === "local" && (changes.blocking || changes.allowed)) ||
    (areaName === "sync" && changes.allowed) ||
    (areaName === "managed" && (changes.allowedSites || changes.forceBlocking || changes.lockAllowlist));
  if (!relevant) return;
  const { blocking } = await state();
  await setBadge(blocking);
  if (blocking) await sweepOpenTabs();
});

// Defense in depth for kiosk use: while blocking, immediately close any
// incognito window. The extension can't run in incognito unless allowed there,
// so this only fires when it has been — the recommended deployment also turns
// incognito off entirely by policy (IncognitoModeAvailability=1). See KIOSK.md.
chrome.windows.onCreated.addListener(async (win) => {
  if (!win.incognito) return;
  const { blocking } = await state();
  if (blocking && win.id != null) chrome.windows.remove(win.id).catch(() => {});
});

async function syncBadge() {
  await syncExpiryAlarm(); // restore the alarm, or end an already-expired session
  const { blocking } = await state();
  await setBadge(blocking);
}

chrome.runtime.onStartup.addListener(syncBadge);
chrome.runtime.onInstalled.addListener(syncBadge);

// Service-worker (re)start: restore the badge to match persisted state.
syncBadge();
