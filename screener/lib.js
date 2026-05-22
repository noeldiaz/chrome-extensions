// Pure, dependency-free helpers shared across the extension. Unit-tested in test/.

export const CAPTURE_MODES = {
  visible: "Visible area",
  selection: "Selected area",
  fullpage: "Full page",
  fullscreen: "Full screen",
};

// Pages Chrome refuses to capture or inject scripts into.
export const PROTECTED_URL =
  /^(chrome|edge|brave|about|chrome-extension|moz-extension|devtools|view-source):|^https:\/\/chrome\.google\.com\/webstore|^https:\/\/chromewebstore\.google\.com/i;

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// e.g. screener-visible-20260522-142233.png
export function captureFilename(mode, when = Date.now()) {
  const d = new Date(when);
  const stamp =
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  const m = Object.prototype.hasOwnProperty.call(CAPTURE_MODES, mode) ? mode : "capture";
  return `screener-${m}-${stamp}.png`;
}

export function dataUrlMimeType(dataUrl) {
  const m = /^data:([^;,]+)[;,]/.exec(dataUrl || "");
  return m ? m[1] : null;
}

export function isImageDataUrl(dataUrl) {
  return /^data:image\//.test(dataUrl || "");
}

// Convert a CSS-pixel selection rect to integer device-pixel source coords for
// cropping a captureVisibleTab image. Clamped to the image bounds when given.
export function scaleRect(rect, dpr = 1, bounds = null) {
  const sx = Math.max(0, Math.round(rect.x * dpr));
  const sy = Math.max(0, Math.round(rect.y * dpr));
  let sw = Math.round(rect.w * dpr);
  let sh = Math.round(rect.h * dpr);
  if (bounds) {
    sw = Math.min(sw, bounds.w - sx);
    sh = Math.min(sh, bounds.h - sy);
  }
  return { sx, sy, sw: Math.max(0, sw), sh: Math.max(0, sh) };
}

export function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Origin match pattern for a runtime host-permission request, e.g.
// "https://api.example.com/tickets" -> "https://api.example.com/*". Null if invalid.
export function originPatternFromUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

// Plan the scroll offsets for a full-page capture: one viewport-height step at a
// time, the last clamped so the bottom is flush, capped at maxTiles. Returns a
// deduped ascending list of Y offsets (always includes 0 and the bottom).
export function planScrollSteps(total, viewportHeight, maxTiles = 40) {
  if (!(viewportHeight > 0)) return [0];
  const last = Math.max(0, total - viewportHeight);
  const steps = [];
  for (let y = 0; y < total && steps.length < maxTiles; y += viewportHeight) {
    steps.push(Math.min(y, last));
  }
  if (steps.length === 0) steps.push(0);
  if (steps[steps.length - 1] !== last && steps.length < maxTiles) steps.push(last);
  return steps.filter((y, i) => i === 0 || y !== steps[i - 1]);
}
