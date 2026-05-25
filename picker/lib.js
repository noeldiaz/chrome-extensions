// Pure color math + formatting for Picker. No DOM, no chrome.* — unit-tested
// headless with node:test (see test/lib.test.js). popup.js imports from here.

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Accepts "#rgb", "rgb", "#rrggbb", "rrggbb" (any case, surrounding space ok).
// Returns canonical lowercase "#rrggbb", or null if it isn't a valid hex color.
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
// Picked colors are opaque, so the alpha forms are fixed at 1 / ff.
export const formatRgba = ({ r, g, b }) => `rgba(${r}, ${g}, ${b}, 1)`;
export const formatHsla = ({ h, s, l }) => `hsla(${h}, ${s}%, ${l}%, 1)`;

// sRGB {r,g,b} 0-255 -> OKLab {L,a,b}. Perceptually uniform, so Euclidean
// distance here is a good "closest color" metric (Björn Ottosson's OKLab).
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

// Closest Tailwind color to {r,g,b}, by OKLab distance.
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

// Pick black or white text for legibility on a color. Returns "#000000"/"#ffffff".
export function contrastText(rgb) {
  return relativeLuminance(rgb) > 0.179 ? "#000000" : "#ffffff";
}

// WCAG contrast ratio between two colors (1 to 21).
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

// A 50-950 shade/tint ramp from a color: keep its OKLCH hue, retarget lightness
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
// (nearest Tailwind) show a color swatch instead of plain text. Shared by the
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

// {h,s,l} (h 0-360, s/l 0-100) -> {r,g,b} 0-255. Inverse of rgbToHsl; h wraps.
export function hslToRgb({ h, s, l }) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// --- Color harmonies -------------------------------------------------------
// Classic color-wheel schemes, each a list of hue offsets (degrees) from the
// base. `harmonies()` keeps the base's S/L and rotates the hue.
export const HARMONIES = [
  { key: "complementary", offsets: [180] },
  { key: "analogous", offsets: [-30, 30] },
  { key: "triadic", offsets: [120, 240] },
  { key: "split", offsets: [150, 210] },
  { key: "tetradic", offsets: [60, 180, 240] },
];

// hex -> [{ key, colors: [base, …rotated] }] (base hex first in every scheme).
export function harmonies(input) {
  const base = normalizeHex(input);
  const rgb = base && hexToRgb(base);
  if (!rgb) return [];
  const { h, s, l } = rgbToHsl(rgb);
  return HARMONIES.map(({ key, offsets }) => ({
    key,
    colors: [base, ...offsets.map((d) => rgbToHex(hslToRgb({ h: h + d, s, l })))],
  }));
}

// --- Developer color formats ----------------------------------------------
// Platform-specific literals for the picked color. `tag` is the pill label.
export const DEV_FORMATS = [
  { key: "cssVar", tag: "CSS var" },
  { key: "swiftui", tag: "SwiftUI" },
  { key: "uicolor", tag: "UIKit" },
  { key: "android", tag: "Android" },
  { key: "flutter", tag: "Flutter" },
  { key: "unity", tag: "Float" },
];

// 0-255 channel -> 0-1 float string with 3 decimals (Swift/Unity style).
const chFloat = (n) => (clamp(n, 0, 255) / 255).toFixed(3);
const hex6Upper = (input) => normalizeHex(input).slice(1).toUpperCase();

export const formatCssVar = (hex) => `--color: ${normalizeHex(hex)};`;
export const formatSwiftUI = ({ r, g, b }) =>
  `Color(red: ${chFloat(r)}, green: ${chFloat(g)}, blue: ${chFloat(b)})`;
export const formatUIColor = ({ r, g, b }) =>
  `UIColor(red: ${chFloat(r)}, green: ${chFloat(g)}, blue: ${chFloat(b)}, alpha: 1.0)`;
export const formatAndroid = (hex) => `0xFF${hex6Upper(hex)}`;
export const formatFlutter = (hex) => `Color(0xFF${hex6Upper(hex)})`;
export const formatUnity = ({ r, g, b }) =>
  `new Color(${chFloat(r)}f, ${chFloat(g)}f, ${chFloat(b)}f)`;

// --- Color-vision (CVD) simulation -----------------------------------------
// Machado et al. (2009) severity-1.0 matrices, applied in linear RGB. Rows sum
// to ~1 so neutrals are preserved.
export const CVD_TYPES = ["protanopia", "deuteranopia", "tritanopia"];
const CVD_MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const srgbToLinear = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(clamp(v, 0, 1) * 255);
};

// {r,g,b} as seen with `type` color blindness ("protanopia"|"deuteranopia"|"tritanopia").
export function simulateCvd(rgb, type) {
  const M = CVD_MATRICES[type];
  if (!M) return { ...rgb };
  const R = srgbToLinear(rgb.r), G = srgbToLinear(rgb.g), B = srgbToLinear(rgb.b);
  return {
    r: linearToSrgb(M[0][0] * R + M[0][1] * G + M[0][2] * B),
    g: linearToSrgb(M[1][0] * R + M[1][1] * G + M[1][2] * B),
    b: linearToSrgb(M[2][0] * R + M[2][1] * G + M[2][2] * B),
  };
}

// --- APCA contrast (WCAG 3 draft, APCA-W3 0.1.9) ---------------------------
// Perceptual contrast Lc of `text` over `bg`. Signed: positive ≈ dark-on-light,
// negative ≈ light-on-dark. |Lc| ≈ 75 ~ body text, 60 ~ readable, 45 ~ large/UI.
export function apcaContrast(text, bg) {
  const Rco = 0.2126729, Gco = 0.7151522, Bco = 0.072175;
  const mainTRC = 2.4, blkThrs = 0.022, blkClmp = 1.414, deltaYmin = 0.0005;
  const scale = 1.14, loClip = 0.1, loOffset = 0.027;
  const normBG = 0.56, normTXT = 0.57, revTXT = 0.62, revBG = 0.65;
  const lum = ({ r, g, b }) =>
    Rco * (r / 255) ** mainTRC + Gco * (g / 255) ** mainTRC + Bco * (b / 255) ** mainTRC;
  const soft = (Y) => (Y < blkThrs ? Y + (blkThrs - Y) ** blkClmp : Y);
  const Ytxt = soft(lum(text));
  const Ybg = soft(lum(bg));
  if (Math.abs(Ybg - Ytxt) < deltaYmin) return 0;
  let out;
  if (Ybg > Ytxt) {
    const sapc = (Ybg ** normBG - Ytxt ** normTXT) * scale;
    out = sapc < loClip ? 0 : sapc - loOffset;
  } else {
    const sapc = (Ybg ** revBG - Ytxt ** revTXT) * scale;
    out = sapc > -loClip ? 0 : sapc + loOffset;
  }
  return out * 100;
}

// --- Accessible-shade helper -----------------------------------------------
// From the picked color's own ramp, the shade closest in lightness to `rgb`
// that still meets `threshold` (default WCAG AA 4.5) against `bgRgb`.
// Returns { step, hex, ratio } or null if none of the 11 steps pass.
export function accessibleShade(rgb, bgRgb, threshold = 4.5) {
  const L0 = rgbToOklch(rgb).L;
  const passing = ramp(rgb)
    .map((s) => ({ ...s, ratio: contrastRatio(hexToRgb(s.hex), bgRgb) }))
    .filter((s) => s.ratio >= threshold);
  if (!passing.length) return null;
  passing.sort(
    (a, b) =>
      Math.abs(rgbToOklch(hexToRgb(a.hex)).L - L0) -
      Math.abs(rgbToOklch(hexToRgb(b.hex)).L - L0),
  );
  return passing[0];
}

// --- Gradient builder ------------------------------------------------------
// CSS gradient from evenly spaced hex stops. `type` is "linear" | "radial" |
// "conic" (angle is ignored for radial). Returns "" if <2 valid stops.
export const GRADIENT_TYPES = ["linear", "radial", "conic"];
export function gradientCss(stops, angle = 90, type = "linear") {
  const valid = (stops || []).map(normalizeHex).filter(Boolean);
  if (valid.length < 2) return "";
  const a = ((Math.round(angle) % 360) + 360) % 360;
  const list = valid
    .map((hex, i) => `${hex} ${Math.round((i / (valid.length - 1)) * 100)}%`)
    .join(", ");
  if (type === "radial") return `radial-gradient(circle, ${list})`;
  if (type === "conic") return `conic-gradient(from ${a}deg, ${list})`;
  return `linear-gradient(${a}deg, ${list})`;
}

// --- Palette export --------------------------------------------------------
// Serialize labeled stops to a sharable snippet. `stops` = [[label, hex], …];
// `format` is "css" (custom properties) | "tailwind" (config object) | "json".
export const EXPORT_FORMATS = ["css", "tailwind", "json"];
export function exportPalette(stops, format = "css", name = "color") {
  const norm = (stops || [])
    .map(([label, hex]) => [String(label), normalizeHex(hex)])
    .filter(([, hex]) => hex);
  if (!norm.length) return "";
  if (format === "json") return JSON.stringify(Object.fromEntries(norm), null, 2);
  if (format === "tailwind")
    return `'${name}': {\n${norm.map(([l, h]) => `  '${l}': '${h}',`).join("\n")}\n},`;
  return norm.map(([l, h]) => `--${name}-${l}: ${h};`).join("\n");
}
