// Pure helpers, unit-tested with node:test. No chrome/DOM access here.

// A QR code of a non-web URL (chrome://, the Web Store, a local file) can't be
// opened by scanning it on another device, so we only encode http(s).
export function isShareableUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Middle-truncate a long URL for display: keep the start (scheme + host) and the
// tail (often the meaningful slug) and drop the middle. Returns text unchanged
// when it already fits.
export function ellipsize(text, max = 72) {
  if (typeof text !== "string" || text.length <= max) return text || "";
  if (max <= 1) return "…";
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return text.slice(0, head) + "…" + text.slice(text.length - tail);
}

// Clamp n into [min, max]; non-numeric input falls back to min.
export function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function degToRad(deg) {
  return (Number(deg) || 0) * (Math.PI / 180);
}

// A match pattern covering one URL's origin, for an optional host-permission
// request (e.g. "https://example.com/*"). Returns null for non-http(s) URLs
// (data:/blob:/extension pages don't need a host permission).
export function originPattern(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

const pad2 = (n) => String(n).padStart(2, "0");

// Build a download filename like "qr-example.com-20260523-141500.png".
// Derives a safe slug from the URL's host (falls back to "code"), and maps the
// qr-code-styling format name to a sensible extension (jpeg -> jpg).
export function downloadFilename(value, format = "png", when = new Date()) {
  let host = "code";
  try {
    host = new URL(value).hostname || "code";
  } catch {
    /* not a URL — keep the fallback */
  }
  const slug = host.replace(/[^a-z0-9.-]+/gi, "").replace(/^-+|-+$/g, "") || "code";
  const stamp =
    `${when.getFullYear()}${pad2(when.getMonth() + 1)}${pad2(when.getDate())}` +
    `-${pad2(when.getHours())}${pad2(when.getMinutes())}${pad2(when.getSeconds())}`;
  const ext = format === "jpeg" ? "jpg" : format;
  return `qr-${slug}-${stamp}.${ext}`;
}
