import { isShareableUrl, originPattern } from "./lib.js";

const DECODE_MAX = 1024; // cap the decode canvas; jsQR is slow on huge images

const $ = (id) => document.getElementById(id);
const els = {
  thumbWrap: $("thumbWrap"),
  thumb: $("thumb"),
  grant: $("grant"),
  pick: $("pick"),
  file: $("file"),
  camera: $("camera"),
  cameraView: $("cameraView"),
  video: $("video"),
  cameraStop: $("cameraStop"),
  result: $("result"),
  content: $("content"),
  goto: $("goto"),
  copy: $("copy"),
  close: $("close"),
  status: $("status"),
  themeToggle: $("theme-toggle"),
  moon: $("moon-icon"),
  sun: $("sun-icon"),
};

let pendingSrc = null; // cross-origin image awaiting a permission grant
let decodedText = "";

// --- theme ---

const osThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  els.moon.classList.toggle("hidden", isDark);
  els.sun.classList.toggle("hidden", !isDark);
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

els.themeToggle.addEventListener("click", async () => {
  const isDark = !document.documentElement.classList.contains("dark");
  applyTheme(isDark);
  await chrome.storage.local.set({ theme: isDark ? "dark" : "light" });
});

// --- status ---

function setStatus(message, ok = true) {
  els.status.textContent = message;
  els.status.classList.toggle("text-red-500", !ok);
  els.status.classList.toggle("dark:text-red-400", !ok);
}

// --- decoding ---

// Draw an ImageBitmap/HTMLImageElement onto a (capped) canvas and run jsQR.
function decode(source) {
  const sw = source.width || source.naturalWidth;
  const sh = source.height || source.naturalHeight;
  if (!sw || !sh) return null;
  const scale = Math.min(1, DECODE_MAX / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return globalThis.jsQR(data, w, h)?.data ?? null;
}

function showResult(text) {
  els.result.hidden = false;
  if (text == null) {
    decodedText = "";
    els.content.value = "";
    els.goto.hidden = true;
    setStatus("No QR code found in that image.", false);
    return;
  }
  decodedText = text;
  els.content.value = text;
  els.goto.hidden = !isShareableUrl(text);
  setStatus("");
}

// Fetch the bytes (so a cross-origin canvas isn't tainted) and decode.
async function fetchAndDecode(src) {
  setStatus("Scanning…");
  try {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const bitmap = await createImageBitmap(await resp.blob());
    showResult(decode(bitmap));
  } catch (e) {
    setStatus("Couldn't read that image: " + (e?.message || e), false);
  }
}

// Decode a right-clicked image URL passed in via ?src=.
async function scanSrc(src) {
  els.thumb.src = src;
  els.thumbWrap.hidden = false;
  const pattern = originPattern(src);
  if (!pattern) {
    // data:/blob:/extension URL — no host permission needed
    await fetchAndDecode(src);
    return;
  }
  const granted = await chrome.permissions.contains({ origins: [pattern] });
  if (granted) {
    await fetchAndDecode(src);
  } else {
    pendingSrc = src;
    els.grant.hidden = false;
    setStatus("This image is on another site — allow access to scan it.");
  }
}

els.grant.addEventListener("click", async () => {
  if (!pendingSrc) return;
  const pattern = originPattern(pendingSrc);
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    setStatus("Access denied — can't scan this image.", false);
    return;
  }
  els.grant.hidden = true;
  await fetchAndDecode(pendingSrc);
  pendingSrc = null;
});

// --- scan from a local file ---

els.pick.addEventListener("click", () => els.file.click());
els.file.addEventListener("change", async () => {
  const file = els.file.files?.[0];
  els.file.value = "";
  if (!file) return;
  els.grant.hidden = true;
  pendingSrc = null;
  try {
    const bitmap = await createImageBitmap(file);
    els.thumb.src = URL.createObjectURL(file);
    els.thumbWrap.hidden = false;
    showResult(decode(bitmap));
  } catch (e) {
    setStatus("Couldn't read that file: " + (e?.message || e), false);
  }
});

// --- scan from the camera ---

let stream = null;
let rafId = null;
let camCanvas = null;
let camCtx = null;

// Grab the current video frame onto a (capped, reused) canvas and run jsQR.
function decodeVideoFrame() {
  const vw = els.video.videoWidth;
  const vh = els.video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, DECODE_MAX / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  if (!camCanvas) {
    camCanvas = document.createElement("canvas");
    camCtx = camCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (camCanvas.width !== w || camCanvas.height !== h) {
    camCanvas.width = w;
    camCanvas.height = h;
  }
  camCtx.drawImage(els.video, 0, 0, w, h);
  const { data } = camCtx.getImageData(0, 0, w, h);
  return globalThis.jsQR(data, w, h)?.data ?? null;
}

function scanLoop() {
  if (!stream) return; // stopped
  let text = null;
  try {
    text = decodeVideoFrame();
  } catch {
    /* a frame may not be ready yet — try again next tick */
  }
  if (text != null) {
    stopCamera();
    showResult(text);
    return;
  }
  rafId = requestAnimationFrame(scanLoop);
}

async function startCamera() {
  els.grant.hidden = true;
  els.result.hidden = true;
  els.thumbWrap.hidden = true;
  pendingSrc = null;
  setStatus("Starting camera…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (e) {
    const msg =
      e?.name === "NotAllowedError" || e?.name === "SecurityError"
        ? "Camera access denied."
        : e?.name === "NotFoundError"
          ? "No camera found."
          : "Couldn't start camera: " + (e?.message || e);
    setStatus(msg, false);
    return;
  }
  els.video.srcObject = stream;
  els.pick.hidden = true;
  els.camera.hidden = true;
  els.cameraView.hidden = false;
  setStatus("Point your camera at a QR code…");
  try {
    await els.video.play();
  } catch {
    /* the autoplay attribute handles playback */
  }
  rafId = requestAnimationFrame(scanLoop);
}

function stopCamera() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  els.video.srcObject = null;
  els.cameraView.hidden = true;
  els.pick.hidden = false;
  els.camera.hidden = false;
}

els.camera.addEventListener("click", startCamera);
els.cameraStop.addEventListener("click", () => {
  stopCamera();
  setStatus("");
});
window.addEventListener("pagehide", stopCamera); // release the camera on close

// --- result actions ---

els.goto.addEventListener("click", () => {
  if (decodedText) chrome.tabs.create({ url: decodedText });
});
els.copy.addEventListener("click", async () => {
  if (!decodedText) return;
  try {
    await navigator.clipboard.writeText(decodedText);
    setStatus("Copied.");
  } catch (e) {
    setStatus("Copy failed: " + (e?.message || e), false);
  }
});
els.close.addEventListener("click", () => window.close());

function init() {
  const src = new URLSearchParams(location.search).get("src");
  if (src) scanSrc(src);
}

loadTheme();
init();
