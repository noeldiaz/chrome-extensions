import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_TOTAL_SECONDS,
  MAX_MINUTES,
  ALARM_PREFIX,
  PROTECTED_URL,
  SCROLL_ORIGINS,
  alarmName,
  tabIdFromAlarm,
  secondsUntil,
  formatMMSS,
  clampInt,
  readInterval,
  intervalLabel,
  relativeTime,
  statsLabel,
} from "../lib.js";

test("alarmName builds the per-tab alarm name", () => {
  assert.equal(alarmName(42), `${ALARM_PREFIX}42`);
  assert.equal(alarmName("7"), `${ALARM_PREFIX}7`);
});

test("tabIdFromAlarm round-trips alarmName", () => {
  assert.equal(tabIdFromAlarm(alarmName(42)), 42);
  assert.equal(tabIdFromAlarm("refresher-tick:0"), 0);
});

test("tabIdFromAlarm rejects foreign alarm names", () => {
  assert.equal(tabIdFromAlarm("other-alarm"), null);
  assert.equal(tabIdFromAlarm(""), null);
});

test("secondsUntil rounds to whole seconds and floors at 0", () => {
  const now = 1_000_000;
  assert.equal(secondsUntil(now + 90_000, now), 90);
  assert.equal(secondsUntil(now + 1_400, now), 1); // rounds
  assert.equal(secondsUntil(now - 5_000, now), 0); // past => 0
});

test("formatMMSS pads seconds and handles large/edge values", () => {
  assert.equal(formatMMSS(0), "0:00");
  assert.equal(formatMMSS(5), "0:05");
  assert.equal(formatMMSS(65), "1:05");
  assert.equal(formatMMSS(600), "10:00");
  assert.equal(formatMMSS(-3), "0:00"); // clamps negatives
  assert.equal(formatMMSS(90.9), "1:30"); // floors fractional
});

test("clampInt parses, clamps, and falls back to min", () => {
  assert.equal(clampInt("15", 0, 59), 15);
  assert.equal(clampInt("99", 0, 59), 59); // above max
  assert.equal(clampInt("-4", 0, 59), 0); // below min
  assert.equal(clampInt("abc", 0, 59), 0); // NaN => min
  assert.equal(clampInt("", 5, 59), 5); // empty => min
  assert.equal(clampInt("12.9", 0, 59), 12); // parseInt truncates
});

test("clampInt treats null max as unbounded", () => {
  assert.equal(clampInt("100000", 0, null), 100000);
});

test("readInterval clamps minutes to MAX_MINUTES and seconds to 0-59", () => {
  assert.deepEqual(readInterval("15", "0"), { minutes: 15, seconds: 0, total: 900 });
  assert.deepEqual(readInterval("2", "30"), { minutes: 2, seconds: 30, total: 150 });
  assert.deepEqual(readInterval(String(MAX_MINUTES + 100), "80"), {
    minutes: MAX_MINUTES,
    seconds: 59,
    total: MAX_MINUTES * 60 + 59,
  });
  assert.deepEqual(readInterval("x", "y"), { minutes: 0, seconds: 0, total: 0 });
});

test("readInterval total can fall below the alarm minimum", () => {
  // popup/background enforce MIN_TOTAL_SECONDS; readInterval just reports the value.
  assert.ok(readInterval("0", "10").total < MIN_TOTAL_SECONDS);
});

test("intervalLabel formats minutes and seconds, dropping zero parts", () => {
  assert.equal(intervalLabel(15, 0), "15 min");
  assert.equal(intervalLabel(0, 30), "30 sec");
  assert.equal(intervalLabel(2, 30), "2 min 30 sec");
  assert.equal(intervalLabel(0, 0), "0 sec");
});

test("PROTECTED_URL matches browser-internal schemes", () => {
  for (const url of [
    "chrome://extensions",
    "chrome-extension://abc/popup.html",
    "about:blank",
    "view-source:https://example.com",
    "devtools://devtools/bundled/inspector.html",
    "file:///Users/me/page.html",
    "edge://settings",
  ]) {
    assert.ok(PROTECTED_URL.test(url), `expected protected: ${url}`);
  }
});

test("PROTECTED_URL allows ordinary web pages", () => {
  for (const url of ["https://example.com", "http://localhost:3000", "https://app.example.com/dash"]) {
    assert.ok(!PROTECTED_URL.test(url), `expected allowed: ${url}`);
  }
});

test("SCROLL_ORIGINS covers http and https match patterns", () => {
  assert.deepEqual(SCROLL_ORIGINS, ["http://*/*", "https://*/*"]);
});

test("relativeTime scales across seconds, minutes, hours, days", () => {
  const now = 10_000_000;
  assert.equal(relativeTime(now, now), "0s ago");
  assert.equal(relativeTime(now - 5_000, now), "5s ago");
  assert.equal(relativeTime(now - 59_000, now), "59s ago");
  assert.equal(relativeTime(now - 90_000, now), "1m ago");
  assert.equal(relativeTime(now - 3_600_000, now), "1h ago");
  assert.equal(relativeTime(now - 26 * 3_600_000, now), "1d ago");
  assert.equal(relativeTime(now + 5_000, now), "0s ago"); // future clamps to 0
});

test("statsLabel summarizes count and last refresh", () => {
  const now = 10_000_000;
  assert.equal(statsLabel(0, null, now), "No refreshes yet");
  assert.equal(statsLabel(0, now - 1000, now), "No refreshes yet"); // count drives it
  assert.equal(statsLabel(12, now - 34_000, now), "12× · 34s ago");
  assert.equal(statsLabel(3, null, now), "3×"); // counted but no timestamp
});
