import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  formatHex,
  formatRgb,
  formatHsl,
  contrastText,
} from "../lib.js";

test("clamp bounds a value", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test("normalizeHex accepts the common forms", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("abc"), "#aabbcc");
  assert.equal(normalizeHex("  #1E88E5 "), "#1e88e5");
  assert.equal(normalizeHex("1e88e5"), "#1e88e5");
});

test("normalizeHex rejects junk", () => {
  assert.equal(normalizeHex("#12"), null);
  assert.equal(normalizeHex("#xyzxyz"), null);
  assert.equal(normalizeHex("rgb(0,0,0)"), null);
  assert.equal(normalizeHex(123), null);
  assert.equal(normalizeHex(""), null);
});

test("hexToRgb parses channels", () => {
  assert.deepEqual(hexToRgb("#000000"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexToRgb("#ffffff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb("#1e88e5"), { r: 30, g: 136, b: 229 });
  assert.equal(hexToRgb("nope"), null);
});

test("rgbToHex round-trips and clamps", () => {
  assert.equal(rgbToHex({ r: 30, g: 136, b: 229 }), "#1e88e5");
  assert.equal(rgbToHex({ r: -10, g: 300, b: 128 }), "#00ff80");
  assert.equal(rgbToHex(hexToRgb("#abcdef")), "#abcdef");
});

test("rgbToHsl matches known colours", () => {
  assert.deepEqual(rgbToHsl({ r: 0, g: 0, b: 0 }), { h: 0, s: 0, l: 0 });
  assert.deepEqual(rgbToHsl({ r: 255, g: 255, b: 255 }), { h: 0, s: 0, l: 100 });
  assert.deepEqual(rgbToHsl({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl({ r: 0, g: 255, b: 0 }), { h: 120, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl({ r: 0, g: 0, b: 255 }), { h: 240, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl({ r: 128, g: 128, b: 128 }), { h: 0, s: 0, l: 50 });
});

test("formatters render the standard strings", () => {
  assert.equal(formatHex("#1e88e5"), "#1E88E5");
  assert.equal(formatHex("nope"), null);
  assert.equal(formatRgb({ r: 30, g: 136, b: 229 }), "rgb(30, 136, 229)");
  assert.equal(formatHsl({ h: 207, s: 79, l: 51 }), "hsl(207, 79%, 51%)");
});

test("contrastText picks legible foreground", () => {
  assert.equal(contrastText({ r: 255, g: 255, b: 255 }), "#000000");
  assert.equal(contrastText({ r: 0, g: 0, b: 0 }), "#ffffff");
  assert.equal(contrastText({ r: 30, g: 136, b: 229 }), "#000000"); // medium blue, L≈0.235
  assert.equal(contrastText({ r: 17, g: 24, b: 39 }), "#ffffff"); // slate-900
  assert.equal(contrastText({ r: 251, g: 191, b: 36 }), "#000000"); // amber
});
