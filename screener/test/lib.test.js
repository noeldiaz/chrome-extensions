import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CAPTURE_MODES,
  PROTECTED_URL,
  pad2,
  captureFilename,
  dataUrlMimeType,
  isImageDataUrl,
  scaleRect,
  planScrollSteps,
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

test("scaleRect multiplies by dpr and rounds to integers", () => {
  assert.deepEqual(scaleRect({ x: 10, y: 20, w: 100, h: 50 }, 2), { sx: 20, sy: 40, sw: 200, sh: 100 });
  assert.deepEqual(scaleRect({ x: 10.4, y: 0, w: 33.3, h: 9.6 }, 1), { sx: 10, sy: 0, sw: 33, sh: 10 });
});

test("scaleRect clamps to image bounds and never goes negative", () => {
  // selection runs past the right/bottom edge -> clamped to what's left
  assert.deepEqual(scaleRect({ x: 90, y: 90, w: 100, h: 100 }, 1, { w: 120, h: 120 }), {
    sx: 90,
    sy: 90,
    sw: 30,
    sh: 30,
  });
  // entirely out of bounds -> zero size, not negative
  assert.deepEqual(scaleRect({ x: 200, y: 200, w: 50, h: 50 }, 1, { w: 100, h: 100 }), {
    sx: 200,
    sy: 200,
    sw: 0,
    sh: 0,
  });
});

test("planScrollSteps covers a tall page top-to-bottom, bottom flush", () => {
  // total 2500, viewport 1000 -> 0, 1000, 1500(clamped bottom)
  assert.deepEqual(planScrollSteps(2500, 1000), [0, 1000, 1500]);
});

test("planScrollSteps returns a single step when the page fits the viewport", () => {
  assert.deepEqual(planScrollSteps(800, 1000), [0]);
  assert.deepEqual(planScrollSteps(1000, 1000), [0]);
});

test("planScrollSteps respects maxTiles", () => {
  const steps = planScrollSteps(100000, 1000, 5);
  assert.equal(steps.length, 5);
  assert.equal(steps[0], 0);
});

test("planScrollSteps is safe with a zero/garbage viewport", () => {
  assert.deepEqual(planScrollSteps(5000, 0), [0]);
});
