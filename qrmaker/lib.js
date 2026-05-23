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

// Largest integer module size so the QR (plus a quiet-zone margin on every side)
// fits within targetPx. dimension is the actual canvas edge length to use.
export function qrLayout(moduleCount, targetPx, marginModules = 4) {
  const total = moduleCount + marginModules * 2;
  const scale = Math.max(1, Math.floor(targetPx / total));
  return { scale, total, dimension: total * scale, margin: marginModules };
}
