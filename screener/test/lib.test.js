import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CAPTURE_MODES,
  PROTECTED_URL,
  pad2,
  captureFilename,
  dataUrlMimeType,
  isImageDataUrl,
} from "../lib.js";

test("CAPTURE_MODES has the four capture modes", () => {
  assert.deepEqual(Object.keys(CAPTURE_MODES).sort(), ["fullpage", "fullscreen", "selection", "visible"]);
});

test("pad2 zero-pads single digits, leaves others", () => {
  assert.equal(pad2(0), "00");
  assert.equal(pad2(7), "07");
  assert.equal(pad2(42), "42");
});

test("captureFilename builds a timestamped png name for a known mode", () => {
  const when = new Date(2026, 4, 22, 14, 22, 33).getTime(); // 2026-05-22 14:22:33 local
  assert.equal(captureFilename("visible", when), "screener-visible-20260522-142233.png");
});

test("captureFilename falls back to 'capture' for an unknown mode", () => {
  const when = new Date(2026, 0, 1, 0, 0, 0).getTime();
  assert.equal(captureFilename("bogus", when), "screener-capture-20260101-000000.png");
});

test("PROTECTED_URL blocks chrome/extension/store pages", () => {
  assert.ok(PROTECTED_URL.test("chrome://settings"));
  assert.ok(PROTECTED_URL.test("chrome-extension://abc/page.html"));
  assert.ok(PROTECTED_URL.test("view-source:https://example.com"));
  assert.ok(PROTECTED_URL.test("https://chromewebstore.google.com/detail/x"));
});

test("PROTECTED_URL allows ordinary http(s) pages", () => {
  assert.ok(!PROTECTED_URL.test("https://example.com/path"));
  assert.ok(!PROTECTED_URL.test("http://localhost:8000"));
});

test("dataUrlMimeType extracts the mime, null when absent", () => {
  assert.equal(dataUrlMimeType("data:image/png;base64,AAAA"), "image/png");
  assert.equal(dataUrlMimeType("data:image/jpeg,xx"), "image/jpeg");
  assert.equal(dataUrlMimeType("not a data url"), null);
  assert.equal(dataUrlMimeType(""), null);
});

test("isImageDataUrl is true only for image data URLs", () => {
  assert.ok(isImageDataUrl("data:image/png;base64,AAAA"));
  assert.ok(!isImageDataUrl("data:text/plain,hello"));
  assert.ok(!isImageDataUrl("https://example.com/x.png"));
  assert.ok(!isImageDataUrl(undefined));
});
