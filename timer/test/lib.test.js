import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOUR,
  MINUTE,
  SECOND,
  TIMER_MAX_MS,
  pad2,
  clampTimerMs,
  hmsToMs,
  msToFields,
  formatTimer,
  formatStopwatch,
  formatClock,
  clockHandAngles,
  formatBadge,
  timerTickStep,
  remainingMs,
  stopwatchElapsed,
  lapRows,
} from "../lib.js";

test("pad2 pads and floors", () => {
  assert.equal(pad2(0), "00");
  assert.equal(pad2(5), "05");
  assert.equal(pad2(42), "42");
  assert.equal(pad2(7.9), "07");
});

test("clampTimerMs floors and bounds to [0, MAX]", () => {
  assert.equal(clampTimerMs(-100), 0);
  assert.equal(clampTimerMs(1500.9), 1500);
  assert.equal(clampTimerMs(TIMER_MAX_MS + HOUR), TIMER_MAX_MS);
  assert.equal(clampTimerMs("abc"), 0);
});

test("hmsToMs combines fields and clamps", () => {
  assert.equal(hmsToMs({ h: 0, m: 5, s: 0 }), 5 * MINUTE);
  assert.equal(hmsToMs({ h: 1, m: 1, s: 1 }), HOUR + MINUTE + SECOND);
  assert.equal(hmsToMs({}), 0);
  assert.equal(hmsToMs({ h: 999 }), TIMER_MAX_MS);
});

test("msToFields ceils for countdown, floors otherwise", () => {
  assert.deepEqual(msToFields(5 * MINUTE, { ceil: true }), { h: 0, m: 5, s: 0 });
  // 4:59.5 left → a countdown should still read 5:00
  assert.deepEqual(msToFields(5 * MINUTE - 500, { ceil: true }), { h: 0, m: 5, s: 0 });
  // floored, the same span is 4:59
  assert.deepEqual(msToFields(5 * MINUTE - 500), { h: 0, m: 4, s: 59 });
  assert.deepEqual(msToFields(HOUR + 2 * MINUTE + 3 * SECOND), { h: 1, m: 2, s: 3 });
});

test("formatTimer renders HH:MM:SS and ceils", () => {
  assert.equal(formatTimer(5 * MINUTE), "00:05:00");
  assert.equal(formatTimer(5 * MINUTE - 1), "00:05:00");
  assert.equal(formatTimer(0), "00:00:00");
  assert.equal(formatTimer(HOUR + 2 * MINUTE + 3 * SECOND), "01:02:03");
});

test("formatTimer trims leading zero groups when asked", () => {
  const t = { trimLeading: true };
  assert.equal(formatTimer(4 * MINUTE + 54 * SECOND, t), "4:54");
  assert.equal(formatTimer(9 * SECOND, t), "9");
  assert.equal(formatTimer(0, t), "0");
  assert.equal(formatTimer(HOUR + 4 * MINUTE + 54 * SECOND, t), "1:04:54");
  assert.equal(formatTimer(10 * MINUTE, t), "10:00");
});

test("formatStopwatch renders HH:MM:SS.CC and floors", () => {
  assert.equal(formatStopwatch(0), "00:00:00.00");
  assert.equal(formatStopwatch(4 * MINUTE + 19 * SECOND + 60), "00:04:19.06");
  assert.equal(formatStopwatch(HOUR + 990), "01:00:00.99");
});

test("formatStopwatch drops centiseconds when hundredths is off", () => {
  const noCs = { hundredths: false };
  assert.equal(formatStopwatch(0, noCs), "00:00:00");
  assert.equal(formatStopwatch(4 * MINUTE + 19 * SECOND + 60, noCs), "00:04:19");
  assert.equal(formatStopwatch(HOUR + 990, noCs), "01:00:00");
});

test("formatStopwatch trims empty leading groups when asked", () => {
  const t = { trimLeading: true };
  assert.equal(formatStopwatch(5 * SECOND + 180, t), "5.18");
  assert.equal(formatStopwatch(0, t), "0.00");
  assert.equal(formatStopwatch(MINUTE + 5 * SECOND, t), "1:05.00");
  assert.equal(formatStopwatch(HOUR + 2 * MINUTE + 3 * SECOND, t), "1:02:03.00");
  assert.equal(formatStopwatch(5 * SECOND, { hundredths: false, trimLeading: true }), "5");
});

test("formatClock handles 24h and 12h", () => {
  const d = new Date(2026, 4, 27, 13, 5, 9);
  assert.deepEqual(formatClock(d), { h: "13", m: "05", s: "09", ampm: "" });
  assert.deepEqual(formatClock(d, { hour12: true }), { h: "1", m: "05", s: "09", ampm: "PM" });
  const midnight = new Date(2026, 4, 27, 0, 0, 0);
  assert.deepEqual(formatClock(midnight, { hour12: true }), { h: "12", m: "00", s: "00", ampm: "AM" });
});

test("clockHandAngles maps time to degrees, hands creeping", () => {
  assert.deepEqual(clockHandAngles(new Date(2026, 4, 27, 0, 0, 0, 0)), { hour: 0, minute: 0, second: 0 });
  // 3:00:00 → hour hand at 90°, others at 0
  assert.deepEqual(clockHandAngles(new Date(2026, 4, 27, 3, 0, 0, 0)), { hour: 90, minute: 0, second: 0 });
  // 6:30:00 → minute at 180°, hour halfway between 6 and 7 (195°)
  const a = clockHandAngles(new Date(2026, 4, 27, 6, 30, 0, 0));
  assert.equal(a.minute, 180);
  assert.equal(a.hour, 195);
  // second hand sweeps with milliseconds: 15.5s → 93°
  assert.equal(clockHandAngles(new Date(2026, 4, 27, 0, 0, 15, 500)).second, 93);
});

test("formatBadge picks a compact unit", () => {
  assert.equal(formatBadge(0), "0s");
  assert.equal(formatBadge(45 * SECOND), "45s");
  assert.equal(formatBadge(4 * MINUTE), "4m");
  assert.equal(formatBadge(90 * MINUTE), "90m");
  assert.equal(formatBadge(2 * HOUR), "2h");
});

test("timerTickStep yields nice major/minor spacing", () => {
  assert.deepEqual(timerTickStep(20 * MINUTE / SECOND), { major: 300, minor: 60 });
  assert.deepEqual(timerTickStep(60), { major: 10, minor: 2 });
  assert.deepEqual(timerTickStep(10 * 60), { major: 120, minor: 24 });
});

test("remainingMs never goes negative", () => {
  assert.equal(remainingMs(1000, 600), 400);
  assert.equal(remainingMs(1000, 2000), 0);
});

test("stopwatchElapsed sums while running, freezes while paused", () => {
  assert.equal(stopwatchElapsed({ running: false, elapsed: 5000 }, 9999), 5000);
  assert.equal(stopwatchElapsed({ running: true, elapsed: 5000, startTime: 1000 }, 4000), 8000);
  assert.equal(stopwatchElapsed({}, 1000), 0);
});

test("lapRows yields split + total, newest first", () => {
  assert.deepEqual(lapRows([]), []);
  assert.deepEqual(lapRows([1000, 3000, 3500]), [
    { index: 3, splitMs: 500, totalMs: 3500 },
    { index: 2, splitMs: 2000, totalMs: 3000 },
    { index: 1, splitMs: 1000, totalMs: 1000 },
  ]);
});
