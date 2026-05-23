import { isShareableUrl, ellipsize, qrLayout } from "./lib.js";

const qrWrapEl = document.getElementById("qrWrap");
const canvasEl = document.getElementById("qr");
const urlEl = document.getElementById("url");
const statusEl = document.getElementById("status");
const themeToggleEl = document.getElementById("theme-toggle");
const moonIconEl = document.getElementById("moon-icon");
const sunIconEl = document.getElementById("sun-icon");

const TARGET_PX = 232; // inner width of the QR card
const QUIET_ZONE = 4; // modules of white border the spec recommends

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

async function toggleTheme() {
  const isDark = !document.documentElement.classList.contains("dark");
  applyTheme(isDark);
  await chrome.storage.local.set({ theme: isDark ? "dark" : "light" });
}

themeToggleEl.addEventListener("click", toggleTheme);

// --- QR rendering ---

function show(message) {
  qrWrapEl.classList.add("hidden");
  urlEl.textContent = "";
  statusEl.textContent = message;
}

// Render `text` onto the canvas. QR is always black-on-white regardless of the
// popup theme — scanners need the contrast — so it sits on a white card.
function drawQr(text) {
  // UTF-8 byte encoding so non-ASCII URLs scan correctly.
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

  let qr = null;
  for (const level of ["M", "L"]) {
    try {
      const candidate = qrcode(0, level); // type 0 = auto-size to the data
      candidate.addData(text);
      candidate.make();
      qr = candidate;
      break;
    } catch {
      // data overflowed this error-correction level; try a lower one
    }
  }
  if (!qr) {
    show("This URL is too long to fit in a QR code.");
    return;
  }

  const count = qr.getModuleCount();
  const { scale, dimension, margin } = qrLayout(count, TARGET_PX, QUIET_ZONE);
  const offset = margin * scale;

  canvasEl.width = dimension;
  canvasEl.height = dimension;
  const ctx = canvasEl.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dimension, dimension);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(offset + c * scale, offset + r * scale, scale, scale);
      }
    }
  }

  qrWrapEl.classList.remove("hidden");
  statusEl.textContent = "";
  urlEl.textContent = ellipsize(text);
  urlEl.title = text;
}

async function main() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || "";
    if (!isShareableUrl(url)) {
      show("Open an http(s) page to make a QR code for it.");
      return;
    }
    drawQr(url);
  } catch (e) {
    show("Couldn't read this tab: " + (e?.message || e));
  }
}

loadTheme();
main();
