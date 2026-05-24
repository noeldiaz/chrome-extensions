import { PROTECTED_URL, scaleRect, planScrollSteps } from "./lib.js";
import { putCapture, purgeStale } from "./idb.js";
import { FEATURES } from "./build-config.js";

// captureVisibleTab is rate-limited (~2/sec without broad host perms), so the
// full-page loop waits between shots. Caps keep runaway pages bounded.
const CAPTURE_DELAY_MS = 450;
const MAX_FULLPAGE_TILES = 40;
const MAX_CANVAS_PX = 32000; // browser canvas dimension ceiling, with headroom

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- capture storage / editor handoff ---

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function finalizeCapture(dataUrl, mode, tab, extra = {}) {
  const meta = {
    mode,
    pageUrl: tab?.url || "",
    pageTitle: tab?.title || "",
    capturedAt: new Date().toISOString(),
    ...extra,
  };
  const id = newId();
  await putCapture(id, { dataUrl, meta });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?id=${id}`) });
  purgeStale().catch(() => {}); // best-effort sweep of any abandoned captures
  return { ok: true };
}

// Surface a failure the popup can't show (it closes for selection / full screen).
async function openEditorError(message) {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?error=${encodeURIComponent(message)}`) });
}

async function surfaceError(e) {
  const message = String(e?.message || e);
  await openEditorError(message);
  return { ok: false, error: message };
}

// --- image helpers (service-worker OffscreenCanvas) ---

async function dataUrlToBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

function canvasToDataUrl(canvas) {
  return new Promise((resolve, reject) => {
    canvas.convertToBlob({ type: "image/png" }).then((blob) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    }, reject);
  });
}

async function cropToSelection(dataUrl, sel) {
  const bmp = await dataUrlToBitmap(dataUrl);
  const { sx, sy, sw, sh } = scaleRect(sel, sel.dpr || 1, { w: bmp.width, h: bmp.height });
  if (sw < 1 || sh < 1) {
    bmp.close();
    throw new Error(chrome.i18n.getMessage("selectionTooSmall"));
  }
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext("2d").drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  bmp.close();
  return canvasToDataUrl(canvas);
}

async function stitchTiles(tiles, vw, total, dpr) {
  const W = Math.min(Math.round(vw * dpr), MAX_CANVAS_PX);
  const H = Math.min(Math.round(total * dpr), MAX_CANVAS_PX);
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d");
  let truncated = false;
  for (const t of tiles) {
    const bmp = await dataUrlToBitmap(t.dataUrl);
    const dy = Math.round(t.y * dpr);
    if (dy >= H) {
      bmp.close();
      truncated = true;
      continue;
    }
    const drawH = Math.min(bmp.height, H - dy);
    ctx.drawImage(bmp, 0, 0, bmp.width, drawH, 0, dy, bmp.width, drawH);
    bmp.close();
  }
  const dataUrl = await canvasToDataUrl(canvas);
  return { dataUrl, truncated };
}

// --- functions injected into the page (must be self-contained) ---

function measurePage() {
  const de = document.documentElement;
  const body = document.body;
  const total = Math.max(de.scrollHeight, body ? body.scrollHeight : 0, de.offsetHeight, window.innerHeight);
  return {
    total,
    vw: window.innerWidth,
    vh: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

function scrollToY(y) {
  window.scrollTo(0, y);
  return window.scrollY;
}

function restoreScroll(x, y) {
  window.scrollTo(x, y);
}

// Hide / restore fixed & sticky elements so they don't repeat in every tile.
function setFixedHidden(hidden) {
  const MARK = "data-screener-hid";
  if (!hidden) {
    for (const el of document.querySelectorAll(`[${MARK}]`)) {
      el.style.visibility = el.getAttribute(MARK);
      el.removeAttribute(MARK);
    }
    return 0;
  }
  let n = 0;
  for (const el of document.querySelectorAll("*")) {
    const pos = getComputedStyle(el).position;
    if (pos === "fixed" || pos === "sticky") {
      el.setAttribute(MARK, el.style.visibility || "");
      el.style.visibility = "hidden";
      n++;
    }
  }
  return n;
}

// Drag-to-select overlay. Resolves {x,y,w,h,dpr} in CSS px, or null if cancelled.
function pickRegion() {
  return new Promise((resolve) => {
    const dpr = window.devicePixelRatio || 1;
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      cursor: "crosshair",
      background: "rgba(15,23,42,0.35)",
      userSelect: "none",
    });
    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed",
      display: "none",
      border: "1.5px solid #3b82f6",
      background: "rgba(59,130,246,0.12)",
      pointerEvents: "none",
    });
    overlay.appendChild(box);
    document.documentElement.appendChild(overlay);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    const rectOf = (e) => {
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      return { x, y, w, h };
    };

    const cleanup = (result) => {
      window.removeEventListener("keydown", onKey, true);
      overlay.remove();
      // Wait two frames so the overlay is fully gone before the screenshot.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(result)));
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(null);
      }
    };

    overlay.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      box.style.display = "block";
      box.style.left = startX + "px";
      box.style.top = startY + "px";
      box.style.width = "0px";
      box.style.height = "0px";
    });
    overlay.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const r = rectOf(e);
      box.style.left = r.x + "px";
      box.style.top = r.y + "px";
      box.style.width = r.w + "px";
      box.style.height = r.h + "px";
    });
    overlay.addEventListener("mouseup", (e) => {
      if (!dragging) return;
      dragging = false;
      const r = rectOf(e);
      if (r.w < 5 || r.h < 5) {
        cleanup(null);
        return;
      }
      cleanup({ ...r, dpr });
    });
    window.addEventListener("keydown", onKey, true);
  });
}

async function exec(tabId, func, args = []) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res?.result;
}

// --- offscreen document (desktop capture needs a DOM the SW doesn't have) ---

let offscreenCreating = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DISPLAY_MEDIA"],
      justification: "Capture a screenshot of the chosen screen or window.",
    });
  }
  await offscreenCreating;
  offscreenCreating = null;
}

// --- capture orchestration ---

async function captureVisible(tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return finalizeCapture(dataUrl, "visible", tab);
}

async function captureSelection(tab) {
  try {
    const sel = await exec(tab.id, pickRegion);
    if (!sel) return { ok: false, error: "Selection cancelled." }; // intentional — stay quiet
    const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const cropped = await cropToSelection(shot, sel);
    return await finalizeCapture(cropped, "selection", tab);
  } catch (e) {
    return surfaceError(e); // popup already closed for selection
  }
}

async function captureFullPage(tab) {
  const tabId = tab.id;
  try {
    const m = await exec(tabId, measurePage);
    const steps = planScrollSteps(m.total, m.vh, MAX_FULLPAGE_TILES);
    const tiles = [];
    try {
      for (let i = 0; i < steps.length; i++) {
        const realY = await exec(tabId, scrollToY, [steps[i]]);
        if (i === 1) await exec(tabId, setFixedHidden, [true]); // keep header in top tile only
        await sleep(i === 0 ? 120 : CAPTURE_DELAY_MS); // settle paint / lazy load + rate limit
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        tiles.push({ y: realY ?? steps[i], dataUrl });
      }
    } finally {
      await exec(tabId, setFixedHidden, [false]).catch(() => {});
      await exec(tabId, restoreScroll, [m.scrollX, m.scrollY]).catch(() => {});
    }
    if (tiles.length === 1) return await finalizeCapture(tiles[0].dataUrl, "fullpage", tab);
    const { dataUrl, truncated } = await stitchTiles(tiles, m.vw, m.total, m.dpr);
    return await finalizeCapture(dataUrl, "fullpage", tab, truncated ? { truncated: true } : {});
  } catch (e) {
    return surfaceError(e);
  }
}

async function captureFullScreen(tab) {
  try {
    await ensureOffscreen();
    const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "grabFrame" });
    if (res?.cancelled) return { ok: false, error: "Screen capture was cancelled." }; // user dismissed picker
    if (!res?.ok) throw new Error(res?.error || chrome.i18n.getMessage("couldNotCaptureScreen"));
    return await finalizeCapture(res.dataUrl, "fullscreen", tab);
  } catch (e) {
    return surfaceError(e); // popup is gone, so show it in a tab
  } finally {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

async function handleCapture(msg) {
  const { mode, tab } = msg;
  if (mode !== "fullscreen" && PROTECTED_URL.test(tab?.url || "")) {
    return { ok: false, error: chrome.i18n.getMessage("cantCapturePage") };
  }
  switch (mode) {
    case "visible":
      return captureVisible(tab);
    case "selection":
      return captureSelection(tab);
    case "fullpage":
      return captureFullPage(tab);
    case "fullscreen":
      if (FEATURES.fullscreenCapture) return captureFullScreen(tab);
      return { ok: false, error: chrome.i18n.getMessage("modeNotSupported", ["fullscreen"]) };
    default:
      return { ok: false, error: chrome.i18n.getMessage("modeNotSupported", [mode]) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "capture") {
    handleCapture(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // async response
  }
  return false;
});

// Keyboard shortcut (Alt+Shift+S by default) → capture the visible area. The
// command grants activeTab for the focused tab, same as clicking the icon.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-visible") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const res = await handleCapture({
    mode: "visible",
    tab: { id: tab.id, windowId: tab.windowId, url: tab.url || "", title: tab.title || "" },
  }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
  if (!res?.ok && res?.error) await openEditorError(res.error); // no popup to show it in
});
