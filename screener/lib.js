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
