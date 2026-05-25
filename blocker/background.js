import { shouldBlock, isHttpUrl } from "./lib.js";
import { syncGet } from "./sync.js";

const BLOCKED_PAGE = "blocked.html";
const BADGE_COLOR = "#dc2626"; // red-600 — blocking is active

// Current settings. `blocking` is per-device (local); `allowed` follows the
// active sync area (local, or sync when the user opts in).
async function state() {
  const { blocking = false } = await chrome.storage.local.get({ blocking: false });
  const { allowed = [] } = await syncGet({ allowed: [] });
  return { blocking, allowed };
}

function blockedUrl(from) {
  return chrome.runtime.getURL(BLOCKED_PAGE) + "?from=" + encodeURIComponent(from || "");
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

function redirect(tabId, fromUrl) {
  chrome.tabs.update(tabId, { url: blockedUrl(fromUrl) }).catch(() => {});
}

// Gate top-frame navigations. We read fresh state each time (cheap storage get)
// so a just-woken service worker never lets a navigation slip through with a
// stale in-memory cache. iframes/sub-resources are left alone.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!isHttpUrl(details.url)) return;
  const { blocking, allowed } = await state();
  if (shouldBlock(details.url, allowed, blocking)) redirect(details.tabId, details.url);
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
    if (tab.id != null && shouldBlock(tab.url || "", allowed, true)) redirect(tab.id, tab.url);
  }
}

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local" && changes.blocking) {
    const on = changes.blocking.newValue;
    await setBadge(on);
    if (on) await sweepOpenTabs();
  }
});

async function syncBadge() {
  const { blocking } = await state();
  await setBadge(blocking);
}

chrome.runtime.onStartup.addListener(syncBadge);
chrome.runtime.onInstalled.addListener(syncBadge);

// Service-worker (re)start: restore the badge to match persisted state.
syncBadge();
