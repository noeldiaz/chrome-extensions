// Pure, dependency-free helpers shared by popup.js and background.js.
// No DOM, no chrome APIs — unit-testable headless with node:test.

export const MIN_TOTAL_SECONDS = 30; // Chrome clamps periodic alarms below this
export const MAX_MINUTES = 1440;
export const ALARM_PREFIX = "refresher-tick:"; // alarm name per tab: refresher-tick:<tabId>

// Optional host permission requested only when the scroll-preservation toggle is on.
export const SCROLL_ORIGINS = ["http://*/*", "https://*/*"];

// URLs Chrome forbids reloading from an extension.
export const PROTECTED_URL =
  /^(chrome|edge|about|chrome-extension|chrome-search|chrome-untrusted|view-source|devtools|file):/i;

export const alarmName = (tabId) => `${ALARM_PREFIX}${tabId}`;

export const tabIdFromAlarm = (name) =>
  name.startsWith(ALARM_PREFIX) ? Number(name.slice(ALARM_PREFIX.length)) : null;

export function secondsUntil(scheduledTime, now = Date.now()) {
  return Math.max(0, Math.round((scheduledTime - now) / 1000));
}

export function formatMMSS(totalSeconds) {
  const t = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function clampInt(value, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

export function readInterval(minutesValue, secondsValue) {
  const minutes = clampInt(minutesValue, 0, MAX_MINUTES);
  const seconds = clampInt(secondsValue, 0, 59);
  return { minutes, seconds, total: minutes * 60 + seconds };
}

export function intervalLabel(minutes, seconds) {
  const parts = [];
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0) parts.push(`${seconds} sec`);
  return parts.join(" ") || "0 sec";
}

export function relativeTime(fromMs, now = Date.now()) {
  const s = Math.max(0, Math.round((now - fromMs) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Per-target refresh summary, e.g. "12× · 34s ago".
export function statsLabel(count, lastRefresh, now = Date.now()) {
  if (!count) return "No refreshes yet";
  const times = `${count}×`;
  return lastRefresh ? `${times} · ${relativeTime(lastRefresh, now)}` : times;
}
