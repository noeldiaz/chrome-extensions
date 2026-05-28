// Pure, DOM- and chrome-free helpers shared by the popup, the full page, and the
// background. Everything here is unit-tested in test/lib.test.js.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

// A countdown is capped at 99:59:59 — two display digits per field, and well past
// any practical use. The floor of 1s keeps "Start" from arming an instant alarm.
export const TIMER_MIN_MS = SECOND;
export const TIMER_MAX_MS = 100 * HOUR - SECOND;

// Settings defaults, referenced by both options.js and background.js.
export const ALERT_DEFAULTS = { sound: true, flash: true, notify: false };

// Quick-fill chips on the timer (seconds). Mirrors the reference: 5/10/30 min, 1h.
export const TIMER_PRESETS = [5 * 60, 10 * 60, 30 * 60, 60 * 60];

export const pad2 = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");

export const clampTimerMs = (ms) =>
  Math.min(TIMER_MAX_MS, Math.max(0, Math.floor(Number(ms) || 0)));

export const hmsToMs = ({ h = 0, m = 0, s = 0 } = {}) =>
  clampTimerMs((Number(h) || 0) * HOUR + (Number(m) || 0) * MINUTE + (Number(s) || 0) * SECOND);

// Break a millisecond span into whole h/m/s fields, rounding the way each tool
// wants: a countdown ceils (5:00 shows the full 5:00 the instant it starts), a
// stopwatch floors (it has only reached 5:00 once it ticks past it).
export function msToFields(ms, { ceil = false } = {}) {
  const total = ceil ? Math.ceil(Math.max(0, ms) / SECOND) : Math.floor(Math.max(0, ms) / SECOND);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

// "HH:MM:SS" for the countdown — ceils so a fresh 5-minute timer reads 00:05:00.
// With trimLeading, fully-zero leading groups (and the first group's leading zero)
// are dropped: 00:04:54 → 4:54, 00:00:09 → 9, 01:04:54 → 1:04:54.
export function formatTimer(ms, { trimLeading = false } = {}) {
  const { h, m, s } = msToFields(ms, { ceil: true });
  if (!trimLeading) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  if (m > 0) return `${m}:${pad2(s)}`;
  return `${s}`;
}

// "HH:MM:SS.CC" for the stopwatch — floors, with centiseconds (matches 00:04:19.06).
// hundredths:false drops the ".CC" for a calmer, second-resolution readout.
export function formatStopwatch(ms, { hundredths = true } = {}) {
  const clamped = Math.max(0, Math.floor(ms));
  const { h, m, s } = msToFields(clamped);
  const base = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  if (!hundredths) return base;
  const cs = Math.floor((clamped % SECOND) / 10);
  return `${base}.${pad2(cs)}`;
}

// Wall-clock parts for the clock tool. hour12 swaps 24h → 12h and returns a meridiem.
export function formatClock(date, { hour12 = false } = {}) {
  let h = date.getHours();
  const ampm = h < 12 ? "AM" : "PM";
  if (hour12) {
    h = h % 12;
    if (h === 0) h = 12;
  }
  return {
    h: hour12 ? String(h) : pad2(h),
    m: pad2(date.getMinutes()),
    s: pad2(date.getSeconds()),
    ampm: hour12 ? ampm : "",
  };
}

// Analog clock hand angles in degrees clockwise from 12 o'clock. The hour and
// minute hands creep between marks; the second hand sweeps with the milliseconds.
export function clockHandAngles(date) {
  const s = date.getSeconds() + date.getMilliseconds() / 1000;
  const m = date.getMinutes() + s / 60;
  const h = (date.getHours() % 12) + m / 60;
  return { hour: h * 30, minute: m * 6, second: s * 6 };
}

// Long date line under the clock, e.g. "Wednesday, May 27".
export function formatDate(date) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

// Milliseconds left on a running countdown, never negative.
export const remainingMs = (endTime, now = Date.now()) => Math.max(0, endTime - now);

// Elapsed for a stopwatch from its persisted state: a frozen total while paused,
// or accumulated + (now - startTime) while running.
export function stopwatchElapsed({ running = false, elapsed = 0, startTime = 0 } = {}, now = Date.now()) {
  return running ? elapsed + Math.max(0, now - startTime) : elapsed;
}

// Turn the cumulative lap snapshots (total elapsed at each press) into display rows:
// each lap's own split plus the running total. Newest first for the list.
export function lapRows(laps = []) {
  const rows = [];
  for (let i = 0; i < laps.length; i++) {
    rows.push({
      index: i + 1,
      splitMs: laps[i] - (i > 0 ? laps[i - 1] : 0),
      totalMs: laps[i],
    });
  }
  return rows.reverse();
}
