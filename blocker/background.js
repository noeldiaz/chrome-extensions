import { shouldBlock, isHttpUrl, hostFromUrl, effectiveAllowed, buildDnrRules } from "./lib.js";
import { syncGet } from "./sync.js";
import { logEvent } from "./audit.js";

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

// Primary enforcement: push (or clear) the declarativeNetRequest dynamic rules
// that block disallowed navigations at the network layer, *before* a page loads
// — no service-worker race, and iframes are covered too. The webNavigation
// listener below stays on as a backstop (and is the only thing that catches
// data: URLs and already-open tabs, which DNR doesn't). Dynamic rules persist
// across restarts, so the lockdown holds even before the worker wakes. No-op on
// engines without DNR (older Safari/Firefox), where the backstop carries it.
async function applyDnr() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  const { blocking, allowed } = await state();
  let existing = [];
  try {
    existing = await chrome.declarativeNetRequest.getDynamicRules();
  } catch {
    return;
  }
  const removeRuleIds = existing.map((r) => r.id);
  const addRules = blocking ? buildDnrRules(allowed) : [];
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  } catch {
    // Host access not yet granted, or a rule the engine rejected. Don't leave a
    // half-applied set (a stale catch-all with no allow rules would block even
    // approved sites) — clear all dynamic rules and let the webNavigation
    // backstop enforce the correct allow/block. Rules retry on the next change.
    try {
      const stale = await chrome.declarativeNetRequest.getDynamicRules();
      if (stale.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: stale.map((r) => r.id) });
    } catch {
      /* nothing more we can do here; backstop carries enforcement */
    }
  }
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

// Backstop to the DNR layer: gate top-frame navigations from the service worker
// too. We read fresh state each time (cheap storage get) so a just-woken worker
// never lets a navigation slip through with a stale cache. This is also the only
// gate for schemes DNR's http(s) rules can't match: data:/filesystem: render
// arbitrary HTML/JS with no prior page load, so both are always blocked here; and
// view-source: is judged by the URL it wraps, so a blocked page's source can't be
// read via view-source:https://blocked/. (blob: is left alone: a blob can only be
// created by a page that already loaded, i.e. an allowed one.)
const BYPASS_SCHEME = /^(data|filesystem):/i;
const VIEW_SOURCE = /^view-source:/i;

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const orig = details.url || "";
  const url = orig.replace(VIEW_SOURCE, ""); // unwrap view-source: to its underlying target
  const http = isHttpUrl(url);
  if (!http && !BYPASS_SCHEME.test(url)) return; // leave chrome://, file:, extension pages, about:
  const { blocking, allowed } = await state();
  if (!blocking) return;
  if (http ? shouldBlock(url, allowed, true) : true) {
    redirect(details.tabId);
    await logBlocked(orig);
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

// End a timed session: turn blocking off and clear its PIN + expiry. Record it
// in the audit trail (a timed expiry, no PIN entered).
async function endSession() {
  await logEvent("expire");
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
  await applyDnr(); // re-derive the network rules whenever blocking/allowlist/policy changes
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
  await applyDnr(); // reconcile the network rules with persisted state on (re)start
  const { blocking } = await state();
  await setBadge(blocking);
}

chrome.runtime.onStartup.addListener(syncBadge);
chrome.runtime.onInstalled.addListener(syncBadge);

// Service-worker (re)start: restore the badge to match persisted state.
syncBadge();
