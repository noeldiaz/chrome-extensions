import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  formatHex,
  formatRgb,
  formatHsl,
  formatHsv,
  formatRgba,
  formatHsla,
  formatOklch,
  rgbToOklch,
  oklchToRgb,
  contrastText,
  contrastRatio,
  wcagLevels,
  ramp,
  nearestTailwind,
} from "../lib.js";
import { TAILWIND_COLORS } from "../palette.js";

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

test("rgbToHsl matches known colors", () => {
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

test("rgbToHsv matches known colors", () => {
  assert.deepEqual(rgbToHsv({ r: 0, g: 0, b: 0 }), { h: 0, s: 0, v: 0 });
  assert.deepEqual(rgbToHsv({ r: 255, g: 255, b: 255 }), { h: 0, s: 0, v: 100 });
  assert.deepEqual(rgbToHsv({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, v: 100 });
  assert.deepEqual(rgbToHsv({ r: 0, g: 128, b: 0 }), { h: 120, s: 100, v: 50 });
});

test("formatHsv renders the standard string", () => {
  assert.equal(formatHsv({ h: 210, s: 50, v: 80 }), "hsv(210, 50%, 80%)");
});

test("nearestTailwind matches exact palette hexes to their name", () => {
  // every palette color should resolve to itself (dist 0)
  for (const c of TAILWIND_COLORS.slice(0, 40)) {
    const got = nearestTailwind(hexToRgb(c.hex), TAILWIND_COLORS);
    assert.ok(got.dist < 1e-3, `${c.name} -> ${got.name} (dist ${got.dist})`);
  }
  // pure colors land on a sensible Tailwind name
  assert.equal(nearestTailwind({ r: 255, g: 255, b: 255 }, TAILWIND_COLORS).name, "white");
  assert.equal(nearestTailwind({ r: 0, g: 0, b: 0 }, TAILWIND_COLORS).name, "black");
  assert.match(nearestTailwind({ r: 21, g: 93, b: 252 }, TAILWIND_COLORS).name, /^blue-/);
});

test("alpha + oklch formatters render the standard strings", () => {
  assert.equal(formatRgba({ r: 30, g: 136, b: 229 }), "rgba(30, 136, 229, 1)");
  assert.equal(formatHsla({ h: 207, s: 79, l: 51 }), "hsla(207, 79%, 51%, 1)");
  assert.match(formatOklch(rgbToOklch({ r: 255, g: 255, b: 255 })), /^oklch\(100\.0% 0\.000 /);
});

test("rgbToOklch <-> oklchToRgb round-trips within sRGB", () => {
  for (const hex of ["#1e88e5", "#fb2c36", "#00bc7d", "#808080"]) {
    const rgb = hexToRgb(hex);
    const { L, C, h } = rgbToOklch(rgb);
    const back = oklchToRgb(L, C, h);
    assert.ok(Math.abs(back.r - rgb.r) <= 1, `${hex} r`);
    assert.ok(Math.abs(back.g - rgb.g) <= 1, `${hex} g`);
    assert.ok(Math.abs(back.b - rgb.b) <= 1, `${hex} b`);
  }
});

test("contrastRatio + wcagLevels match WCAG", () => {
  assert.equal(Math.round(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })), 21);
  assert.equal(contrastRatio({ r: 10, g: 10, b: 10 }, { r: 10, g: 10, b: 10 }), 1);
  const lv = wcagLevels(4.5);
  assert.deepEqual(lv, { aaNormal: true, aaaNormal: false, aaLarge: true, aaaLarge: true });
  assert.equal(wcagLevels(7).aaaNormal, true);
  assert.equal(wcagLevels(2.9).aaLarge, false);
});

test("ramp yields 11 steps from light to dark", () => {
  const r = ramp({ r: 30, g: 136, b: 229 });
  assert.equal(r.length, 11);
  assert.deepEqual(r.map((s) => s.step), [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
  // every entry is a valid hex, and lightness decreases across the ramp
  for (const s of r) assert.ok(/^#[0-9a-f]{6}$/.test(s.hex), s.hex);
  const lum = (hex) => rgbToOklch(hexToRgb(hex)).L;
  assert.ok(lum(r[0].hex) > lum(r[10].hex));
});

test("contrastText picks legible foreground", () => {
  assert.equal(contrastText({ r: 255, g: 255, b: 255 }), "#000000");
  assert.equal(contrastText({ r: 0, g: 0, b: 0 }), "#ffffff");
  assert.equal(contrastText({ r: 30, g: 136, b: 229 }), "#000000"); // medium blue, L≈0.235
  assert.equal(contrastText({ r: 17, g: 24, b: 39 }), "#ffffff"); // slate-900
  assert.equal(contrastText({ r: 251, g: 191, b: 36 }), "#000000"); // amber
});
