import { isShareableUrl, originPattern, detectType } from "./lib.js";
import { initTheme } from "./theme.js";
import { iconOpenExternal, iconCopy, iconEdit } from "./icons.js";
import { localize, t } from "./i18n.js";

const DECODE_MAX = 1024; // cap the decode canvas; jsQR is slow on huge images
const TYPE_LABELS = {
  wifi: t("typeWifi"),
  vcard: t("typeVcard"),
  email: t("typeEmail"),
  sms: t("typeSms"),
  tel: t("typeTel"),
  geo: t("typeGeo"),
};

// Open the editor for a decoded payload, parsing a structured one back into its
// form (via ?type=) so it round-trips instead of landing as raw text.
function editUrl(text) {
  const kind = detectType(text);
  let url = chrome.runtime.getURL("editor.html") + "?data=" + encodeURIComponent(text);
  if (kind !== "text") url += "&type=" + kind;
  return url;
}

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
  pageList: $("pageList"),
  content: $("content"),
  typeBadge: $("typeBadge"),
  goto: $("goto"),
  copy: $("copy"),
  edit: $("edit"),
  dropHint: $("dropHint"),
  dropOverlay: $("dropOverlay"),
  winClose: $("winClose"),
  status: $("status"),
  themeToggle: $("theme-toggle"),
  moon: $("moon-icon"),
  sun: $("sun-icon"),
};

let pendingSrc = null; // cross-origin image awaiting a permission grant
let decodedText = "";

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
    els.edit.hidden = true;
    els.typeBadge.hidden = true;
    setStatus(t("noQrFound"), false);
    return;
  }
  decodedText = text;
  els.content.value = text;
  els.goto.hidden = !isShareableUrl(text);
  els.edit.hidden = false;
  const kind = detectType(text);
  els.typeBadge.hidden = kind === "text";
  if (kind !== "text") els.typeBadge.textContent = TYPE_LABELS[kind];
  setStatus("");
}

// Fetch the bytes (so a cross-origin canvas isn't tainted) and decode.
async function fetchAndDecode(src) {
  setStatus(t("scanning"));
  try {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const bitmap = await createImageBitmap(await resp.blob());
    showResult(decode(bitmap));
  } catch (e) {
    setStatus(t("errReadImage", [e?.message || String(e)]), false);
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
    setStatus(t("crossOriginNotice"));
  }
}

els.grant.addEventListener("click", async () => {
  if (!pendingSrc) return;
  const pattern = originPattern(pendingSrc);
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    setStatus(t("accessDenied"), false);
    return;
  }
  els.grant.hidden = true;
  await fetchAndDecode(pendingSrc);
  pendingSrc = null;
});

// --- scan from a local file ---

// Decode a local image File (from the file picker, a drop, or a paste).
async function decodeFile(file) {
  els.grant.hidden = true;
  pendingSrc = null;
  els.pageList.hidden = true;
  try {
    const bitmap = await createImageBitmap(file);
    els.thumb.src = URL.createObjectURL(file);
    els.thumbWrap.hidden = false;
    showResult(decode(bitmap));
  } catch (e) {
    setStatus(t("errReadFile", [e?.message || String(e)]), false);
  }
}

els.pick.addEventListener("click", () => els.file.click());
els.file.addEventListener("change", async () => {
  const file = els.file.files?.[0];
  els.file.value = "";
  if (file) await decodeFile(file);
});

// --- drag & drop / paste an image ---

// First image file in a DataTransfer / clipboard item list, or null.
function firstImageFile(items) {
  for (const it of items || []) {
    if (it.kind === "file" && it.type.startsWith("image/")) return it.getAsFile();
  }
  return null;
}

const hasFiles = (e) => !!e.dataTransfer?.types?.includes("Files");
let dragDepth = 0; // ignore dragleave over child elements

document.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  els.dropOverlay.hidden = false;
});
document.addEventListener("dragover", (e) => {
  if (hasFiles(e)) e.preventDefault();
});
document.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) els.dropOverlay.hidden = true;
});
document.addEventListener("drop", async (e) => {
  if (!e.dataTransfer) return;
  e.preventDefault();
  dragDepth = 0;
  els.dropOverlay.hidden = true;
  const file = firstImageFile(e.dataTransfer.items) || e.dataTransfer.files?.[0] || null;
  if (file && file.type?.startsWith("image/")) await decodeFile(file);
  else setStatus(t("notImage"), false);
});

// Paste an image straight from the clipboard (no clipboard permission needed —
// the paste gesture exposes the bytes via the event itself).
document.addEventListener("paste", async (e) => {
  const file = firstImageFile(e.clipboardData?.items);
  if (!file) return;
  e.preventDefault();
  await decodeFile(file);
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
  setStatus(t("cameraStarting"));
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (e) {
    const msg =
      e?.name === "NotAllowedError" || e?.name === "SecurityError"
        ? t("cameraDenied")
        : e?.name === "NotFoundError"
          ? t("cameraNotFound")
          : t("cameraError", [e?.message || String(e)]);
    setStatus(msg, false);
    return;
  }
  els.video.srcObject = stream;
  els.pick.hidden = true;
  els.camera.hidden = true;
  els.cameraView.hidden = false;
  setStatus(t("cameraPoint"));
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
  // Re-check at the sink: the button is only hidden (not removed) for non-web
  // payloads, so never hand a non-http(s) string to tabs.create.
  if (decodedText && isShareableUrl(decodedText)) chrome.tabs.create({ url: decodedText }).catch(() => {});
});
els.copy.addEventListener("click", async () => {
  if (!decodedText) return;
  try {
    await navigator.clipboard.writeText(decodedText);
    setStatus(t("copied"));
  } catch (e) {
    setStatus(t("errCopy", [e?.message || String(e)]), false);
  }
});
els.edit.addEventListener("click", () => {
  if (decodedText) chrome.tabs.create({ url: editUrl(decodedText) }).catch(() => {});
});
els.winClose.addEventListener("click", () => window.close());

// --- page scan (list of every QR code found on the active tab) ---

// Build a row action button: an icon followed by a label. The icon HTML and
// labels are static literals (no decoded text), so innerHTML is safe here.
function rowButton(label, icon, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.innerHTML = icon + "<span>" + label + "</span>";
  b.addEventListener("click", onClick);
  return b;
}

// A small re-encoded preview of the decoded payload (works for codes that came
// from a <canvas> too, where there's no source image to show).
function pageThumb(text) {
  const thumb = document.createElement("div");
  thumb.className = "shrink-0 overflow-hidden rounded bg-white p-1";
  const mount = document.createElement("div");
  mount.className = "h-14 w-14";
  thumb.appendChild(mount);
  try {
    new QRCodeStyling({
      width: 56,
      height: 56,
      type: "canvas",
      data: text,
      margin: 2,
      dotsOptions: { type: "square", color: "#000000" },
      backgroundOptions: { color: "#ffffff" },
    }).append(mount);
  } catch {
    /* if re-encoding fails (e.g. payload too long) just show the empty tile */
  }
  return thumb;
}

function pageRow(text) {
  const row = document.createElement("div");
  row.className =
    "flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800";
  row.appendChild(pageThumb(text));

  const body = document.createElement("div");
  body.className = "min-w-0 flex-1";

  const p = document.createElement("p");
  p.className = "break-all text-sm text-slate-800 dark:text-slate-100";
  p.textContent = text;
  body.appendChild(p);

  const actions = document.createElement("div");
  actions.className = "mt-2 flex flex-wrap gap-2";

  if (isShareableUrl(text)) {
    actions.appendChild(
      rowButton(t("goTo"), iconOpenExternal, "qr-btn-primary", () =>
        chrome.tabs.create({ url: text }).catch(() => {}),
      ),
    );
  }

  actions.appendChild(
    rowButton(t("copy"), iconCopy, "qr-btn-neutral", async () => {
      try {
        await navigator.clipboard.writeText(text);
        setStatus(t("copied"));
      } catch (e) {
        setStatus(t("errCopy", [e?.message || String(e)]), false);
      }
    }),
  );

  // Edit: hand the decoded text to the advanced editor to restyle and re-export
  // (structured payloads reopen in their own form via editUrl's ?type=).
  actions.appendChild(
    rowButton(t("edit"), iconEdit, "qr-btn-neutral", () =>
      chrome.tabs.create({ url: editUrl(text) }).catch(() => {}),
    ),
  );

  body.appendChild(actions);
  row.appendChild(body);
  return row;
}

function renderPageResults({ results, tainted }) {
  // TODO(i18n): these page-scan status lines carry counts + plurals; Chrome's
  // i18n has no plural rules, so they stay English until a per-locale solution.
  if (!results.length) {
    setStatus(
      tainted
        ? `No readable QR codes found (${tainted} cross-site image(s) couldn't be read).`
        : "No QR codes found on this page.",
      false,
    );
    return;
  }
  els.pageList.replaceChildren(...results.map((r) => pageRow(r.text)));
  els.pageList.hidden = false;
  const skipped = tainted ? ` (${tainted} cross-site image(s) skipped)` : "";
  setStatus(`Found ${results.length} QR code${results.length === 1 ? "" : "s"}.${skipped}`);
}

async function showPageScan() {
  els.pick.hidden = true; // the single-image controls don't apply to a page scan
  els.camera.hidden = true;
  els.dropHint.hidden = true;
  const { pageScan } = await chrome.storage.session.get({ pageScan: null });
  await chrome.storage.session.remove("pageScan");
  const data = pageScan || { results: [], tainted: 0 };
  if (data.error) {
    setStatus(t("errScanPage", [data.error]), false);
    return;
  }
  renderPageResults(data);
}

// --- size the window to its content ---

const WIN_MIN_H = 220; // never shrink below the header + a couple of buttons
const WIN_MAX_H = 680; // beyond this the body scrolls instead of growing

let fitQueued = false;

// Resize the host popup window so its viewport matches the body's natural
// height — the window grows and shrinks with the content (camera view, result
// list, etc.) instead of sitting at a fixed, mostly-empty size. No-ops when the
// page isn't in its own window (e.g. if it were ever opened as a tab).
function fitWindow() {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(async () => {
    fitQueued = false;
    try {
      const frame = window.outerHeight - window.innerHeight; // title bar + borders
      const target = Math.min(Math.max(document.body.offsetHeight + frame, WIN_MIN_H), WIN_MAX_H);
      const win = await chrome.windows.getCurrent();
      if (win?.id != null && Math.abs((win.height ?? 0) - target) > 2) {
        await chrome.windows.update(win.id, { height: Math.round(target) });
      }
    } catch {
      /* not a popup window — nothing to resize */
    }
  });
}

function init() {
  const params = new URLSearchParams(location.search);
  if (params.get("mode") === "page") {
    showPageScan();
  } else {
    const src = params.get("src");
    if (src) scanSrc(src);
  }
  // Re-fit whenever the content's height changes. Resizing the window doesn't
  // change the body's height, so this can't loop.
  new ResizeObserver(fitWindow).observe(document.body);
}

localize();
initTheme({ toggle: els.themeToggle, moon: els.moon, sun: els.sun });
init();
