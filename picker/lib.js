// Pure colour math + formatting for Picker. No DOM, no chrome.* — unit-tested
// headless with node:test (see test/lib.test.js). popup.js imports from here.

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Accepts "#rgb", "rgb", "#rrggbb", "rrggbb" (any case, surrounding space ok).
// Returns canonical lowercase "#rrggbb", or null if it isn't a valid hex colour.
export function normalizeHex(input) {
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/.test(s)) return null;
  return "#" + s;
}

// "#rrggbb" (or any normalizeHex-able string) -> {r,g,b} 0-255, or null.
export function hexToRgb(input) {
  const s = normalizeHex(input);
  if (!s) return null;
  return {
    r: parseInt(s.slice(1, 3), 16),
    g: parseInt(s.slice(3, 5), 16),
    b: parseInt(s.slice(5, 7), 16),
  };
}

// {r,g,b} 0-255 -> canonical lowercase "#rrggbb" (values clamped + rounded).
export function rgbToHex({ r, g, b }) {
  const h = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

// {r,g,b} 0-255 -> {h,s,l} with h 0-360, s/l 0-100 (rounded ints).
export function rgbToHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// {r,g,b} 0-255 -> {h,s,v} with h 0-360, s/v 0-100 (rounded ints).
export function rgbToHsv({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round((max === 0 ? 0 : d / max) * 100), v: Math.round(max * 100) };
}

export const formatHex = (input) => {
  const s = normalizeHex(input);
  return s ? s.toUpperCase() : null;
};
export const formatRgb = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;
export const formatHsl = ({ h, s, l }) => `hsl(${h}, ${s}%, ${l}%)`;
export const formatHsv = ({ h, s, v }) => `hsv(${h}, ${s}%, ${v}%)`;
// Picked colours are opaque, so the alpha forms are fixed at 1 / ff.
export const formatRgba = ({ r, g, b }) => `rgba(${r}, ${g}, ${b}, 1)`;
export const formatHsla = ({ h, s, l }) => `hsla(${h}, ${s}%, ${l}%, 1)`;

// sRGB {r,g,b} 0-255 -> OKLab {L,a,b}. Perceptually uniform, so Euclidean
// distance here is a good "closest colour" metric (Björn Ottosson's OKLab).
export function rgbToOklab({ r, g, b }) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

// Closest Tailwind colour to {r,g,b}, by OKLab distance.
// `palette` = [{ name, hex, L, a, b }] (see palette.js). Returns { name, hex, dist }.
export function nearestTailwind(rgb, palette) {
  const q = rgbToOklab(rgb);
  let best = null;
  let bd = Infinity;
  for (const c of palette) {
    const dl = q.L - c.L;
    const da = q.a - c.a;
    const db = q.b - c.b;
    const d = dl * dl + da * da + db * db;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best && { name: best.name, hex: best.hex, dist: Math.sqrt(bd) };
}

// WCAG relative luminance of {r,g,b} (0-1).
export function relativeLuminance({ r, g, b }) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// Pick black or white text for legibility on a colour. Returns "#000000"/"#ffffff".
export function contrastText(rgb) {
  return relativeLuminance(rgb) > 0.179 ? "#000000" : "#ffffff";
}

// WCAG contrast ratio between two colours (1 to 21).
export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// WCAG pass/fail for a ratio, normal vs large (≥18.66px bold / 24px) text.
export function wcagLevels(ratio) {
  return {
    aaNormal: ratio >= 4.5,
    aaaNormal: ratio >= 7,
    aaLarge: ratio >= 3,
    aaaLarge: ratio >= 4.5,
  };
}

// sRGB {r,g,b} -> OKLCH { L (0-1), C, h (0-360) }.
export function rgbToOklch(rgb) {
  const { L, a, b } = rgbToOklab(rgb);
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

export const formatOklch = ({ L, C, h }) =>
  `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${h.toFixed(1)})`;

// OKLCH (L 0-1, C, h deg) -> sRGB {r,g,b} 0-255 (gamut-clamped).
export function oklchToRgb(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const to8 = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(clamp(v, 0, 1) * 255);
  };
  return {
    r: to8(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: to8(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: to8(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

// A 50-950 shade/tint ramp from a colour: keep its OKLCH hue, retarget lightness
// to Tailwind-like steps, and taper chroma at the extremes so the ends stay
// natural. Returns [{ step, hex }] (gamut-clamped).
const RAMP = [
  [50, 0.97], [100, 0.94], [200, 0.88], [300, 0.81], [400, 0.72], [500, 0.64],
  [600, 0.56], [700, 0.49], [800, 0.44], [900, 0.4], [950, 0.27],
];
export function ramp(rgb) {
  const { C, h } = rgbToOklch(rgb);
  return RAMP.map(([step, L]) => {
    const t = 1 - Math.abs(L - 0.62) / 0.62; // 1 near mid lightness, 0 at the ends
    const c = C * clamp(0.4 + 0.6 * t, 0.35, 1);
    return { step, hex: rgbToHex(oklchToRgb(L, c, h)) };
  });
}

// Display formats in popup order. `tag` = the row's short label; `chip` rows
// (nearest Tailwind) show a colour swatch instead of plain text. Shared by the
// popup (which rows to show) and the settings page (visibility + default copy).
export const FORMATS = [
  { key: "hex", tag: "HEX", label: "HEX" },
  { key: "rgb", tag: "RGB", label: "RGB" },
  { key: "hsl", tag: "HSL", label: "HSL" },
  { key: "hsv", tag: "HSV", label: "HSV" },
  { key: "oklch", tag: "OKLCH", label: "OKLCH" },
  { key: "rgba", tag: "RGBA", label: "RGBA" },
  { key: "hsla", tag: "HSLA", label: "HSLA" },
  { key: "hex8", tag: "HEX8", label: "HEX (8-digit)" },
  { key: "tw", tag: "TW", label: "Nearest Tailwind", chip: true },
];

// Shown by default: HEX, RGB, and nearest Tailwind. Users enable the rest in
// settings (Value formats).
export const DEFAULT_FORMATS = {
  hex: true, rgb: true, hsl: false, hsv: false, oklch: false,
  rgba: false, hsla: false, hex8: false, tw: true,
};
