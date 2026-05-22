import {
  MIN_TOTAL_SECONDS,
  SCROLL_ORIGINS,
  alarmName,
  tabIdFromAlarm,
  secondsUntil,
  formatMMSS,
} from "./lib.js";

async function getTargets() {
  const { targets } = await chrome.storage.local.get({ targets: {} });
  return targets;
}

async function setTargets(targets) {
  await chrome.storage.local.set({ targets });
}

let badgeTimer = null;
let keepAliveTimer = null;

function stopBadgeTimers() {
  if (badgeTimer) {
    clearInterval(badgeTimer);
    badgeTimer = null;
  }
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

async function setBadgeText(text) {
  await chrome.action.setBadgeText({ text });
  if (text) {
    await chrome.action.setBadgeBackgroundColor({ color: "#1e88e5" });
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ color: "#ffffff" });
    }
  }
}

async function tickSingleBadge(tabId) {
  const alarm = await chrome.alarms.get(alarmName(tabId));
  await setBadgeText(alarm ? formatMMSS(secondsUntil(alarm.scheduledTime)) : "");
}

// Badge state:
//  - 0 targets → empty.
//  - exactly 1 → live countdown (1s ticker + keepalive to survive MV3 idle).
//  - 2+        → static tab count, no timers, so the SW sleeps between alarms.
async function updateBadge() {
  const ids = Object.keys(await getTargets());
  stopBadgeTimers();

  if (ids.length === 1) {
    const tabId = Number(ids[0]);
    await tickSingleBadge(tabId);
    badgeTimer = setInterval(() => tickSingleBadge(tabId), 1000);
    // keepalive — a runtime API call counts as activity, keeps the SW alive for the
    // live countdown. Only runs in single-tab mode.
    keepAliveTimer = setInterval(() => {
      chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
    }, 20000);
    return;
  }

  await setBadgeText(ids.length ? String(ids.length) : "");
}

async function arm({ tabId, totalSeconds, tabTitle, windowId, minutes, seconds }) {
  const targets = await getTargets();
  const prev = targets[tabId] || {};
  targets[tabId] = {
    minutes,
    seconds,
    tabTitle: tabTitle || "",
    windowId: windowId ?? null,
    count: prev.count || 0, // keep stats when only the interval changes
    lastRefresh: prev.lastRefresh || null,
  };
  await setTargets(targets);

  const safeSeconds = Math.max(MIN_TOTAL_SECONDS, totalSeconds | 0);
  const period = safeSeconds / 60;
  await chrome.alarms.create(alarmName(tabId), {
    delayInMinutes: period,
    periodInMinutes: period,
  });
  await updateBadge();
}

async function bumpStats(tabId) {
  const targets = await getTargets();
  if (!(tabId in targets)) return;
  targets[tabId].count = (targets[tabId].count || 0) + 1;
  targets[tabId].lastRefresh = Date.now();
  await setTargets(targets);
}

async function removeTarget(tabId) {
  const targets = await getTargets();
  if (tabId in targets) {
    delete targets[tabId];
    await setTargets(targets);
  }
  await chrome.alarms.clear(alarmName(tabId));
  await updateBadge();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "arm") await arm(msg);
    else if (msg?.type === "disarm") await removeTarget(msg.tabId);
    sendResponse({ ok: true });
  })();
  return true;
});

// Scroll preservation is opt-in: enabled in the popup AND backed by a granted
// optional host permission. Both must hold or we plain-reload.
async function scrollPreserveOn() {
  const { preserveScroll } = await chrome.storage.local.get({ preserveScroll: false });
  if (!preserveScroll) return false;
  return chrome.permissions.contains({ origins: SCROLL_ORIGINS });
}

async function captureScroll(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ x: window.scrollX, y: window.scrollY }),
    });
    return res?.result ?? null;
  } catch {
    return null; // page blocks injection (e.g. PDF viewer, store) — skip
  }
}

// Best-effort: scroll back once the reloaded tab reports "complete". If the SW
// is torn down before that fires, the restore is simply skipped.
function restoreScrollAfterLoad(tabId, pos) {
  const onComplete = (changedId, info) => {
    if (changedId !== tabId || info.status !== "complete") return;
    chrome.tabs.onUpdated.removeListener(onComplete);
    chrome.scripting
      .executeScript({
        target: { tabId },
        func: (x, y) => window.scrollTo(x, y),
        args: [pos.x, pos.y],
      })
      .catch(() => {});
  };
  chrome.tabs.onUpdated.addListener(onComplete);
}

async function tryReload(tabId, preserve = false) {
  // tab existence first — tab gone is terminal
  try {
    await chrome.tabs.get(tabId);
  } catch {
    return "gone";
  }
  const pos = preserve ? await captureScroll(tabId) : null;
  try {
    await chrome.tabs.reload(tabId, { bypassCache: true });
  } catch {
    return "fail";
  }
  if (pos && (pos.x || pos.y)) restoreScrollAfterLoad(tabId, pos);
  return "ok";
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const tabId = tabIdFromAlarm(alarm.name);
  if (tabId == null) return;

  const targets = await getTargets();
  if (!(tabId in targets)) {
    await chrome.alarms.clear(alarm.name); // orphan alarm, no matching target
    return;
  }

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    await removeTarget(tabId);
    return;
  }
  if (tab.audible) return; // skip cycle — tab playing audio; alarm repeats

  const result = await tryReload(tabId, await scrollPreserveOn());
  if (result === "gone") {
    await removeTarget(tabId);
    return;
  }
  if (result === "ok") await bumpStats(tabId);
  if (result === "fail") {
    // transient — retry once after 5s (best-effort; SW may sleep first)
    setTimeout(async () => {
      const retry = await tryReload(tabId);
      if (retry === "gone") await removeTarget(tabId);
      else if (retry === "ok") await bumpStats(tabId);
    }, 5000);
  }
  await updateBadge(); // resume single-tab countdown ticker after an SW wake
});

chrome.tabs.onRemoved.addListener(async (closedId) => {
  const targets = await getTargets();
  if (closedId in targets) await removeTarget(closedId);
});

chrome.tabs.onUpdated.addListener(async (updatedId, info) => {
  if (info.title == null) return; // requires "tabs" permission to be delivered
  const targets = await getTargets();
  if (!(updatedId in targets)) return;
  targets[updatedId].tabTitle = info.title;
  await setTargets(targets);
});

// One-time migration from the single-target schema (<= 0.1.0).
async function migrate() {
  const old = await chrome.storage.local.get({ enabled: undefined, tabId: undefined });
  if (old.enabled === undefined && old.tabId === undefined) return;
  if (old.enabled && old.tabId != null) {
    const { minutes, seconds, tabTitle, windowId } = await chrome.storage.local.get({
      minutes: 15,
      seconds: 0,
      tabTitle: "",
      windowId: null,
    });
    const targets = await getTargets();
    targets[old.tabId] = { minutes, seconds, tabTitle, windowId };
    await setTargets(targets);
  }
  await chrome.storage.local.remove(["enabled", "tabId", "tabTitle", "windowId"]);
}

// Re-arm surviving targets. Note tab IDs do not persist across a browser restart,
// so stale targets are pruned here.
async function rehydrate() {
  await migrate();
  const targets = await getTargets();
  let changed = false;
  for (const key of Object.keys(targets)) {
    const t = targets[key];
    const total = (t.minutes || 0) * 60 + (t.seconds || 0);
    if (total < MIN_TOTAL_SECONDS) {
      delete targets[key];
      changed = true;
      continue;
    }
    try {
      await chrome.tabs.get(Number(key));
      const period = total / 60;
      await chrome.alarms.create(alarmName(key), {
        delayInMinutes: period,
        periodInMinutes: period,
      });
    } catch {
      delete targets[key];
      changed = true;
    }
  }
  if (changed) await setTargets(targets);
  await updateBadge();
}

chrome.runtime.onStartup.addListener(rehydrate);
chrome.runtime.onInstalled.addListener(rehydrate);

// SW (re)start: restore badge state, resuming the single-tab countdown ticker if armed.
updateBadge();
