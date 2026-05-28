// Owns the countdown's end event. The end can be triggered two ways: the alarm
// here (the only thing that survives every surface closing) or a "timer:ended"
// message from an open page that ticked to zero first (precise even under Chrome's
// ~30s alarm-minimum clamp). Either way endNow() runs once — it flips the stored
// state to "ended", plays the chime via an offscreen document (so sound works with
// nothing on screen), and fires the system notification. The on-page flash is the
// page's job; the chime/notification are ours alone, which keeps them from doubling.
import { ALERT_DEFAULTS, formatTimer, formatBadge } from "./lib.js";

const ALARM = "timerEnd";
const NOTIFY_ID = "timerDone";

const TM_DEFAULT = { status: "idle", endTime: 0, remaining: 0, duration: 0 };

async function getTimer() {
  const { tm } = await chrome.storage.local.get({ tm: TM_DEFAULT });
  return tm;
}

async function getAlerts() {
  const { alerts } = await chrome.storage.local.get({ alerts: { ...ALERT_DEFAULTS } });
  return { ...ALERT_DEFAULTS, ...alerts };
}

async function scheduleEnd(endTime) {
  await chrome.alarms.clear(ALARM);
  if (endTime > Date.now()) await chrome.alarms.create(ALARM, { when: endTime });
}

// ---- toolbar badge: show the remaining time on the icon (opt-in) ----------
// Mirrors Refresher: a 1s ticker repaints the badge while a countdown runs, plus a
// keepalive ping so the MV3 worker doesn't sleep mid-countdown. Off → no timers.
let badgeTimer = null;
let keepAlive = null;

function stopBadgeTimers() {
  if (badgeTimer) {
    clearInterval(badgeTimer);
    badgeTimer = null;
  }
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}

async function setBadge(text) {
  await chrome.action?.setBadgeText?.({ text });
  if (text) {
    // Colour setters are absent on some engines (Safari styles badges itself).
    await chrome.action?.setBadgeBackgroundColor?.({ color: "#2563eb" });
    await chrome.action?.setBadgeTextColor?.({ color: "#ffffff" });
  }
}

async function tickBadge() {
  const tm = await getTimer();
  if (tm.status !== "running") {
    stopBadgeTimers();
    await setBadge("");
    return;
  }
  await setBadge(formatBadge(tm.endTime - Date.now()));
}

async function refreshBadge() {
  stopBadgeTimers();
  const { timerBadge } = await chrome.storage.local.get({ timerBadge: false });
  const tm = await getTimer();
  if (timerBadge && tm.status === "running") {
    await tickBadge();
    badgeTimer = setInterval(tickBadge, 1000);
    keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError), 20000);
  } else {
    await setBadge("");
  }
}

// Offscreen document is the only way an MV3 background can play audio. Absent on
// Safari/Firefox builds (the manifest's offscreen permission/files are stripped) —
// there the page chimes instead, so we just no-op.
async function playChime() {
  if (!chrome.offscreen) return;
  try {
    if (await chrome.offscreen.hasDocument()) {
      chrome.runtime.sendMessage({ target: "offscreen", type: "beep" }, () => void chrome.runtime.lastError);
      return;
    }
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play the end-of-countdown chime.",
    });
    // The document plays on load; close it shortly after so it doesn't linger.
    setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), 3000);
  } catch {
    /* offscreen unavailable or already closing — page-side fallback covers sound */
  }
}

let ending = false; // guards against two concurrent end triggers double-firing

async function endNow() {
  if (ending) return;
  ending = true;
  try {
    const tm = await getTimer();
    if (tm.status !== "running") return; // paused/reset/already-ended → nothing to do
    await chrome.alarms.clear(ALARM);
    await chrome.storage.local.set({ tm: { ...tm, status: "ended", remaining: 0 } });

    const alerts = await getAlerts();
    if (alerts.sound) await playChime();
    if (alerts.notify && chrome.notifications) {
      chrome.notifications.create(NOTIFY_ID, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: chrome.i18n.getMessage("notifyTitle") || "Timer finished",
        message: chrome.i18n.getMessage("notifyBody", [formatTimer(tm.duration || 0)]) || "Your countdown is up.",
        priority: 2,
        requireInteraction: true,
      });
    }
  } finally {
    ending = false;
  }
  await refreshBadge(); // ended → no longer running → clears the badge
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "offscreen") return false; // not for us — the offscreen doc handles it
  if (sender.id !== chrome.runtime.id) return false; // only our own surfaces drive the timer
  (async () => {
    try {
      if (msg?.type === "timer:start") await scheduleEnd(Number(msg.endTime) || 0);
      else if (msg?.type === "timer:clear") await chrome.alarms.clear(ALARM);
      else if (msg?.type === "timer:ended") await endNow();
      sendResponse({ ok: true });
    } catch {
      sendResponse({ ok: false });
    }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) endNow();
});

// The badge follows the timer's stored state and the opt-in toggle, from whichever
// surface changed them (start/pause/reset in a page, the switch in options).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("tm" in changes || "timerBadge" in changes)) refreshBadge();
});

// A running countdown must re-arm its alarm after the SW restarts or the browser
// relaunches; if it already lapsed while we were gone, end it now.
async function rehydrate() {
  const tm = await getTimer();
  if (tm.status !== "running") {
    await refreshBadge();
    return;
  }
  if (tm.endTime > Date.now()) await scheduleEnd(tm.endTime);
  else await endNow();
  await refreshBadge();
}

chrome.runtime.onStartup.addListener(rehydrate);
chrome.runtime.onInstalled.addListener(rehydrate);
rehydrate();
