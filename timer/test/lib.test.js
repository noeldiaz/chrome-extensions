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

test("formatStopwatch renders HH:MM:SS.CC and floors", () => {
  assert.equal(formatStopwatch(0), "00:00:00.00");
  assert.equal(formatStopwatch(4 * MINUTE + 19 * SECOND + 60), "00:04:19.06");
  assert.equal(formatStopwatch(HOUR + 990), "01:00:00.99");
});

test("formatClock handles 24h and 12h", () => {
  const d = new Date(2026, 4, 27, 13, 5, 9);
  assert.deepEqual(formatClock(d), { h: "13", m: "05", s: "09", ampm: "" });
  assert.deepEqual(formatClock(d, { hour12: true }), { h: "1", m: "05", s: "09", ampm: "PM" });
  const midnight = new Date(2026, 4, 27, 0, 0, 0);
  assert.deepEqual(formatClock(midnight, { hour12: true }), { h: "12", m: "00", s: "00", ampm: "AM" });
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
