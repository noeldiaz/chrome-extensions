import { downloadFilename, clamp, degToRad } from "./lib.js";
import { getLogos } from "./idb.js";

const qrWrapEl = document.getElementById("qrWrap");
const qrMountEl = document.getElementById("qrMount");
const contentEl = document.getElementById("content");
const colorDotsEl = document.getElementById("colorDots");
const colorCornersEl = document.getElementById("colorCorners");
const colorBgEl = document.getElementById("colorBg");
const resetEl = document.getElementById("reset");
const controlsEl = document.getElementById("controls");
const downloadEl = document.getElementById("download");
const downloadMenuEl = document.getElementById("downloadMenu");
const downloadCaretEl = document.getElementById("download-caret");
const copyEl = document.getElementById("copy");
const advancedEl = document.getElementById("advanced");
const scanEl = document.getElementById("scan");
const statusEl = document.getElementById("status");
const themeToggleEl = document.getElementById("theme-toggle");
const moonIconEl = document.getElementById("moon-icon");
const sunIconEl = document.getElementById("sun-icon");
const winCloseEl = document.getElementById("winClose");

const QR_SIZE = 232; // on-screen preview edge
const DEFAULT_EXPORT = 1024; // export size when the preset doesn't specify one
const CONTENT_MAX_LINES = 5; // the content field grows up to this many lines, then scrolls
// Styling base for the quick code: built-in defaults, or the user's default
// preset once one is set. The popup's colour pickers override colours; dot /
// corner style, error level, gradient, logo and margin all come from here.
const BASE_DEFAULT = {
  dotStyle: "square",
  cornerStyle: "square",
  colorDots: "#000000",
  colorCorners: "#000000",
  colorBg: "#ffffff",
  gradientOn: false,
  gradColor1: "#1e88e5",
  gradColor2: "#ffffff",
  gradType: "linear",
  gradRotation: 0,
  margin: 8,
  ecLevel: "H",
  size: DEFAULT_EXPORT,
  logoSize: 40,
  logoId: null,
};

let qr = null; // QRCodeStyling instance for the preview
let currentUrl = ""; // the active tab's URL, used to seed the content field
let statusTimer = null;
let base = { ...BASE_DEFAULT }; // active styling base (preset or defaults)
let baseLogo = null; // resolved logo dataURL from the preset, or null

// --- theme (popup-only, mirrors the other extensions) ---

const osThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  moonIconEl.classList.toggle("hidden", isDark);
  sunIconEl.classList.toggle("hidden", !isDark);
  document.body.classList.remove("invisible");
}

async function loadTheme() {
  const { theme } = await chrome.storage.local.get({ theme: null });
  applyTheme(theme === "dark" || (theme == null && osThemeMedia.matches));
}

osThemeMedia.addEventListener("change", async (e) => {
  const { theme } = await chrome.storage.local.get({ theme: null });
  if (theme == null) applyTheme(e.matches);
});

themeToggleEl.addEventListener("click", async () => {
  const isDark = !document.documentElement.classList.contains("dark");
  applyTheme(isDark);
  await chrome.storage.local.set({ theme: isDark ? "dark" : "light" });
});

// --- status feedback ---

function flash(message, ok = true) {
  statusEl.textContent = message;
  statusEl.classList.toggle("text-red-500", !ok);
  statusEl.classList.toggle("dark:text-red-400", !ok);
  clearTimeout(statusTimer);
  if (ok && message) statusTimer = setTimeout(() => (statusEl.textContent = ""), 2000);
}

// --- QR options + rendering ---

function dataFor() {
  return contentEl.value.trim();
}

// Grow the content field to fit its text, up to CONTENT_MAX_LINES; beyond that
// it stops growing and scrolls. The field is border-box, so scrollHeight (which
// omits the border) must be padded by the border or it overflows by ~2px and
// shows a scrollbar even when the text fits — hence the explicit border math.
function autoGrow() {
  contentEl.style.height = "auto";
  const cs = getComputedStyle(contentEl);
  const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.375;
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const max = Math.ceil(line * CONTENT_MAX_LINES + pad + border); // border-box cap
  const full = contentEl.scrollHeight + border; // border-box height to show all text
  const capped = full > max;
  contentEl.style.height = (capped ? max : full) + "px";
  contentEl.style.overflowY = capped ? "auto" : "hidden";
}

// Background comes from the preset gradient when one is set; otherwise the
// popup's own colour picker.
function popupBackground() {
  if (base.gradientOn) {
    return {
      gradient: {
        type: base.gradType,
        rotation: degToRad(base.gradRotation),
        colorStops: [
          { offset: 0, color: base.gradColor1 },
          { offset: 1, color: base.gradColor2 },
        ],
      },
    };
  }
  return { color: colorBgEl.value };
}

// A full QRCodeStyling option set: the styling base (preset or defaults) with
// the popup's editable colours layered on top. Dot/corner style and error level
// come from the base — they're tuned in the advanced editor.
function qrOptions(data, size = QR_SIZE) {
  return {
    width: size,
    height: size,
    type: "canvas",
    data,
    margin: base.margin,
    qrOptions: { errorCorrectionLevel: base.ecLevel || "H" },
    dotsOptions: { color: colorDotsEl.value, type: base.dotStyle || "square" },
    cornersSquareOptions: { color: colorCornersEl.value, type: base.cornerStyle || "square" },
    cornersDotOptions: { color: colorCornersEl.value },
    backgroundOptions: popupBackground(),
    image: baseLogo || "",
    imageOptions: { imageSize: clamp(base.logoSize, 10, 50) / 100, margin: 4, hideBackgroundDots: true },
  };
}

// Seed the popup's colour pickers from the styling base so they reflect the preset.
function seedFromBase() {
  colorDotsEl.value = base.colorDots;
  colorCornersEl.value = base.colorCorners;
  colorBgEl.value = base.colorBg;
}

// Adopt the user's default preset (if any) as the styling base.
async function loadDefaultPreset() {
  try {
    const { presets, defaultPresetId } = await chrome.storage.local.get({
      presets: [],
      defaultPresetId: null,
    });
    const def =
      defaultPresetId != null && Array.isArray(presets)
        ? presets.find((p) => p.id === defaultPresetId)
        : null;
    if (def?.config) base = { ...BASE_DEFAULT, ...def.config };
    if (base.logoId != null) {
      const found = (await getLogos()).find((l) => l.id === base.logoId);
      baseLogo = found ? found.dataUrl : null;
    }
  } catch {
    /* fall back to BASE_DEFAULT */
  }
  seedFromBase();
}

function hideQr(message) {
  qr = null;
  qrWrapEl.classList.add("hidden");
  controlsEl.classList.add("hidden");
  qrMountEl.replaceChildren();
  flash(message, false);
}

function renderQr(data) {
  qr = new QRCodeStyling(qrOptions(data));
  qrMountEl.replaceChildren();
  qr.append(qrMountEl);
  qrWrapEl.classList.remove("hidden");
  controlsEl.classList.remove("hidden");
  flash("");
}

// Decide what (if anything) to show, then render. Called on content changes.
function updatePreview() {
  const data = dataFor();
  if (!data) {
    hideQr("Enter a URL or text to make a code.");
    return;
  }
  renderQr(data);
}

// Recolour the existing preview live without rebuilding (no flicker).
function applyLive() {
  if (!qr) return;
  qr.update(qrOptions(dataFor()));
}

// --- download format menu ---

function setMenuOpen(open) {
  downloadMenuEl.hidden = !open;
  downloadEl.setAttribute("aria-expanded", String(open));
  downloadCaretEl.classList.toggle("rotate-180", open);
}

downloadEl.addEventListener("click", () => setMenuOpen(downloadMenuEl.hidden));
document.addEventListener("click", (e) => {
  if (!controlsEl.contains(e.target)) setMenuOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !downloadMenuEl.hidden) {
    setMenuOpen(false);
    downloadEl.focus();
  }
});

// Build a fresh instance at the export size so the preview is undisturbed.
async function rawData(format) {
  const data = dataFor();
  const exporter = new QRCodeStyling(qrOptions(data, base.size || DEFAULT_EXPORT));
  return { blob: await exporter.getRawData(format), data };
}

async function download(format) {
  if (!qr) return;
  setMenuOpen(false);
  try {
    const { blob, data } = await rawData(format);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = downloadFilename(data, format);
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  } catch (e) {
    flash("Download failed: " + (e?.message || e), false);
  }
}

async function copyImage() {
  if (!qr) return;
  try {
    const { blob } = await rawData("png"); // clipboard images are PNG
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    flash("Copied to clipboard.");
  } catch (e) {
    flash("Copy failed: " + (e?.message || e), false);
  }
}

// Reset returns colours to the styling base and the content to the tab URL.
function reset() {
  contentEl.value = currentUrl;
  autoGrow();
  seedFromBase();
  updatePreview();
}

// --- wiring ---

for (const item of downloadMenuEl.querySelectorAll("[data-format]")) {
  item.addEventListener("click", () => download(item.dataset.format));
}
copyEl.addEventListener("click", copyImage);
advancedEl.addEventListener("click", () => {
  const data = dataFor();
  const suffix = data ? "?data=" + encodeURIComponent(data) : "";
  chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") + suffix });
  window.close();
});
scanEl.addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("result.html"),
    type: "popup",
    width: 460,
    height: 560,
  });
  window.close();
});

contentEl.addEventListener("input", () => {
  autoGrow();
  updatePreview();
});
for (const el of [colorDotsEl, colorCornersEl, colorBgEl]) {
  el.addEventListener("input", applyLive);
}
resetEl.addEventListener("click", reset);
winCloseEl.addEventListener("click", () => window.close());

async function main() {
  await loadDefaultPreset(); // seeds colours + styling base before first render
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentUrl = tab?.url || "";
  } catch (e) {
    currentUrl = "";
    flash("Couldn't read this tab: " + (e?.message || e), false);
  }
  contentEl.value = currentUrl;
  autoGrow();
  updatePreview();
}

loadTheme();
main();
