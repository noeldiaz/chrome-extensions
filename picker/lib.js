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

export const formatHex = (input) => {
  const s = normalizeHex(input);
  return s ? s.toUpperCase() : null;
};
export const formatRgb = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;
export const formatHsl = ({ h, s, l }) => `hsl(${h}, ${s}%, ${l}%)`;

// Pick black or white text for legibility on a colour, via WCAG relative
// luminance. Returns "#000000" or "#ffffff".
export function contrastText({ r, g, b }) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  return lum > 0.179 ? "#000000" : "#ffffff";
}
