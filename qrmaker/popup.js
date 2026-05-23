import { isShareableUrl, ellipsize, downloadFilename } from "./lib.js";

const qrWrapEl = document.getElementById("qrWrap");
const qrMountEl = document.getElementById("qrMount");
const urlEl = document.getElementById("url");
const contentTypeEl = document.getElementById("contentType");
const contentTextWrapEl = document.getElementById("contentTextWrap");
const contentTextEl = document.getElementById("contentText");
const styleEl = document.getElementById("style");
const sizeEl = document.getElementById("size");
const ecLevelEl = document.getElementById("ecLevel");
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
const statusEl = document.getElementById("status");
const themeToggleEl = document.getElementById("theme-toggle");
const moonIconEl = document.getElementById("moon-icon");
const sunIconEl = document.getElementById("sun-icon");

const QR_SIZE = 232; // on-screen preview edge
const EXPORT_SIZE = { small: 256, medium: 512, large: 1024 };
const DOT_TYPE = { classic: "square", rounded: "rounded", dots: "dots", smooth: "classy-rounded" };
const EC = { low: "L", medium: "M", quartile: "Q", high: "H" };
const DEFAULTS = {
  contentType: "url",
  style: "classic",
  size: "medium",
  ecLevel: "medium",
  colorDots: "#000000",
  colorCorners: "#000000",
  colorBg: "#ffffff",
};

let qr = null; // QRCodeStyling instance for the preview
let currentUrl = "";
let statusTimer = null;

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
  return contentTypeEl.value === "text" ? contentTextEl.value.trim() : currentUrl;
}

// A full QRCodeStyling option set from the current control values. Kept black-on
// a chosen background; the "outside" picker drives both corner squares + dots.
function qrOptions(data, size = QR_SIZE) {
  const style = styleEl.value;
  return {
    width: size,
    height: size,
    type: "canvas",
    data,
    margin: 8,
    qrOptions: { errorCorrectionLevel: EC[ecLevelEl.value] || "M" },
    dotsOptions: { color: colorDotsEl.value, type: DOT_TYPE[style] || "square" },
    cornersSquareOptions: {
      color: colorCornersEl.value,
      type: style === "classic" ? "square" : "extra-rounded",
    },
    cornersDotOptions: { color: colorCornersEl.value },
    backgroundOptions: { color: colorBgEl.value },
  };
}

function hideQr(message) {
  qr = null;
  qrWrapEl.classList.add("hidden");
  controlsEl.classList.add("hidden");
  qrMountEl.replaceChildren();
  urlEl.textContent = "";
  flash(message, false);
}

function renderQr(data) {
  qr = new QRCodeStyling(qrOptions(data));
  qrMountEl.replaceChildren();
  qr.append(qrMountEl);
  qrWrapEl.classList.remove("hidden");
  controlsEl.classList.remove("hidden");
  urlEl.textContent = ellipsize(data);
  urlEl.title = data;
  flash("");
}

// Decide what (if anything) to show, then render. Called on data/type changes.
function updatePreview() {
  contentTextWrapEl.hidden = contentTypeEl.value !== "text";
  const data = dataFor();
  if (contentTypeEl.value === "url" && !isShareableUrl(data)) {
    hideQr("Open an http(s) page, or switch Type to Custom text.");
    return;
  }
  if (!data) {
    hideQr("Enter text to make a QR code.");
    return;
  }
  renderQr(data);
}

// Restyle/recolor the existing preview live without rebuilding (no flicker).
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

// Build a fresh instance at the chosen export size so the preview is undisturbed.
async function rawData(format) {
  const data = dataFor();
  const exporter = new QRCodeStyling(qrOptions(data, EXPORT_SIZE[sizeEl.value] || 512));
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

function reset() {
  contentTypeEl.value = DEFAULTS.contentType;
  styleEl.value = DEFAULTS.style;
  sizeEl.value = DEFAULTS.size;
  ecLevelEl.value = DEFAULTS.ecLevel;
  colorDotsEl.value = DEFAULTS.colorDots;
  colorCornersEl.value = DEFAULTS.colorCorners;
  colorBgEl.value = DEFAULTS.colorBg;
  contentTextEl.value = "";
  updatePreview();
}

// --- wiring ---

for (const item of downloadMenuEl.querySelectorAll("[data-format]")) {
  item.addEventListener("click", () => download(item.dataset.format));
}
copyEl.addEventListener("click", copyImage);
advancedEl.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
  window.close();
});

contentTypeEl.addEventListener("change", () => {
  updatePreview();
  if (contentTypeEl.value === "text") contentTextEl.focus();
});
contentTextEl.addEventListener("input", updatePreview);
for (const el of [styleEl, ecLevelEl, colorDotsEl, colorCornersEl, colorBgEl]) {
  el.addEventListener("input", applyLive);
}
resetEl.addEventListener("click", reset);

async function main() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentUrl = tab?.url || "";
  } catch (e) {
    currentUrl = "";
    flash("Couldn't read this tab: " + (e?.message || e), false);
  }
  updatePreview();
}

loadTheme();
main();
