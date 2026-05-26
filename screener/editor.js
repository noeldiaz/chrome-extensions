import { loadTheme, wireTheme } from "./theme.js";
import { localize, t } from "./i18n.js";
import { FEATURES } from "./build-config.js";
import { captureFilename, originPatternFromUrl } from "./lib.js";
import { takeCapture } from "./idb.js";
import { Annotator } from "./annotator.js";
import { syncGet, isSyncOn } from "./sync.js";

const stageEl = document.getElementById("stage");
const emptyEl = document.getElementById("empty");
const metaEl = document.getElementById("meta");
const toolbarEl = document.getElementById("toolbar");
const downloadEl = document.getElementById("download");
const copyEl = document.getElementById("copy");
const submitEl = document.getElementById("submit");
const undoEl = document.getElementById("undo");
const redoEl = document.getElementById("redo");
const deleteEl = document.getElementById("delete");
const zoomOutEl = document.getElementById("zoomOut");
const zoomInEl = document.getElementById("zoomIn");
const zoomFitEl = document.getElementById("zoomFit");
const zoomLabelEl = document.getElementById("zoomLabel");

// Submit modal
const submitModalEl = document.getElementById("submitModal");
const ticketTitleEl = document.getElementById("ticketTitle");
const ticketDescEl = document.getElementById("ticketDesc");
const submitStatusEl = document.getElementById("submitStatus");
const submitSendEl = document.getElementById("submitSend");
const submitCancelEl = document.getElementById("submitCancel");
const openOptionsEl = document.getElementById("openOptions");

const params = new URLSearchParams(location.search);
const id = params.get("id");
const errorMsg = params.get("error");
let current = null;
let anno = null;
let settings = { endpoint: "", token: "" };

async function loadCapture() {
  if (!id) return null;
  return takeCapture(id); // reads once and removes it — transient by design
}

function showEmpty(message) {
  if (message) {
    emptyEl.textContent = message;
    emptyEl.classList.add("text-red-500", "dark:text-red-400");
  }
  emptyEl.hidden = false;
  stageEl.hidden = true;
  toolbarEl.classList.add("pointer-events-none", "opacity-50");
}

// --- toolbar wiring ---

function selectInGroup(attr, el) {
  for (const b of el.parentElement.querySelectorAll(`[${attr}]`)) {
    b.classList.toggle("is-active", b === el);
  }
}

function activateTool(name) {
  const btn = toolbarEl.querySelector(`[data-tool="${name}"]`);
  if (!btn) return;
  selectInGroup("data-tool", btn);
  anno.setTool(name);
}

function wireToolbar() {
  toolbarEl.addEventListener("click", (e) => {
    const tool = e.target.closest("[data-tool]");
    if (tool) return activateTool(tool.dataset.tool);
    const color = e.target.closest("[data-color]");
    if (color) {
      selectInGroup("data-color", color);
      return anno.setColor(color.dataset.color);
    }
    const width = e.target.closest("[data-width]");
    if (width) {
      selectInGroup("data-width", width);
      return anno.setStrokeWidth(Number(width.dataset.width));
    }
  });

  undoEl.addEventListener("click", () => anno.undo());
  redoEl.addEventListener("click", () => anno.redo());
  deleteEl.addEventListener("click", () => anno.deleteSelected());
  zoomOutEl.addEventListener("click", () => anno.zoomBy(0.8));
  zoomInEl.addEventListener("click", () => anno.zoomBy(1.25));
  zoomFitEl.addEventListener("click", () => anno.fitToWindow());
}

function isTyping(e) {
  const el = e.target;
  return el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);
}

function wireShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (isTyping(e) || !submitModalEl.hidden) return; // don't act behind an open modal
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? anno.redo() : anno.undo();
    }
    if (e.key === "Delete" || e.key === "Backspace") return anno.deleteSelected();
    if (e.key === "+" || e.key === "=") return anno.zoomBy(1.25);
    if (e.key === "-") return anno.zoomBy(0.8);
    if (e.key === "0") return anno.fitToWindow();
    const map = { v: "select", r: "rect", a: "arrow", p: "pen", t: "text", c: "comment" };
    const name = map[e.key.toLowerCase()];
    if (name) activateTool(name);
  });
}

// --- outputs ---

const footerStatusEl = document.getElementById("status");
let footerTimer = null;
function flash(message, ok = true) {
  footerStatusEl.textContent = message;
  footerStatusEl.classList.toggle("text-red-500", !ok);
  footerStatusEl.classList.toggle("dark:text-red-400", !ok);
  clearTimeout(footerTimer);
  footerTimer = setTimeout(() => (footerStatusEl.textContent = ""), 2500);
}

function captureName() {
  const m = current?.meta || {};
  return captureFilename(m.mode || "capture", Date.parse(m.capturedAt) || Date.now());
}

async function annotatedBlob() {
  return (await fetch(anno.toDataURL())).blob();
}

async function download() {
  if (!anno) return;
  // Blob URL, not a data: URL — large captures exceed the downloads URL limit.
  const url = URL.createObjectURL(await annotatedBlob());
  try {
    if (FEATURES.nativeDownloads && chrome.downloads?.download) {
      await chrome.downloads.download({ url, filename: captureName(), saveAs: true });
    } else {
      // Safari (no chrome.downloads): a normal anchor download from this tab page.
      const a = document.createElement("a");
      a.href = url;
      a.download = captureName();
      a.click();
    }
  } catch (e) {
    // Cancelling the "Save As" dialog rejects — that's intentional, so stay quiet;
    // surface anything else.
    const msg = String(e?.message || e);
    if (!/cancel/i.test(msg)) flash(t("errDownload", [msg]), false);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000); // let the download read it first
  }
}

async function copyImage() {
  if (!anno) return;
  try {
    const blob = await annotatedBlob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    flash(t("copiedToClipboard"));
  } catch (e) {
    flash(t("errCopy", [e?.message || String(e)]), false);
  }
}

// --- submit ticket ---

function setSubmitStatus(message, ok = true) {
  submitStatusEl.textContent = message;
  submitStatusEl.classList.toggle("text-red-500", !ok);
  submitStatusEl.classList.toggle("dark:text-red-400", !ok);
}

function openSubmit() {
  if (!anno) return;
  setSubmitStatus(settings.endpoint ? "" : t("setEndpointFirst"), !!settings.endpoint);
  ticketTitleEl.value = current?.meta?.pageTitle || "";
  submitModalEl.hidden = false;
  ticketTitleEl.focus();
  ticketTitleEl.select();
}

function closeSubmit() {
  submitModalEl.hidden = true;
}

async function doSubmit() {
  const title = ticketTitleEl.value.trim();
  if (!title) return setSubmitStatus(t("titleRequired"), false);
  if (!settings.endpoint) return setSubmitStatus(t("setEndpointFirst"), false);
  const origin = originPatternFromUrl(settings.endpoint);
  if (!origin) return setSubmitStatus(t("endpointInvalid"), false);

  // permissions.request must be the first await so the user gesture survives.
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) return setSubmitStatus(t("permissionDenied"), false);

  submitSendEl.disabled = true;
  setSubmitStatus(t("sending"));
  try {
    const m = current?.meta || {};
    const fd = new FormData();
    fd.append("title", title);
    if (ticketDescEl.value.trim()) fd.append("description", ticketDescEl.value.trim());
    fd.append("screenshot", await annotatedBlob(), captureName());
    if (m.pageUrl) fd.append("page_url", m.pageUrl);
    fd.append(
      "meta",
      JSON.stringify({
        mode: m.mode || null,
        pageTitle: m.pageTitle || null,
        capturedAt: m.capturedAt || null,
        userAgent: navigator.userAgent,
        viewport: { w: window.screen?.width || null, h: window.screen?.height || null },
        devicePixelRatio: window.devicePixelRatio || 1,
      }),
    );

    const headers = { Accept: "application/json" };
    if (settings.token) headers.Authorization = `Bearer ${settings.token}`;
    const res = await fetch(settings.endpoint, { method: "POST", headers, body: fd });

    if (res.ok) {
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* empty/non-JSON body is fine */
      }
      const ref = data.url || (data.id != null ? `#${data.id}` : "");
      setSubmitStatus(t("ticketSubmitted", [ref ? " — " + ref : ""]));
      setTimeout(closeSubmit, 1600);
    } else {
      let msg = "";
      try {
        msg = (await res.json()).message || "";
      } catch {
        /* ignore */
      }
      setSubmitStatus(t("submitFailedStatus", [String(res.status), msg ? ": " + msg : ""]), false);
    }
  } catch (e) {
    setSubmitStatus(t("errSubmit", [e?.message || String(e)]), false);
  } finally {
    submitSendEl.disabled = false;
  }
}

// --- boot ---

async function init() {
  if (errorMsg) {
    showEmpty(t("editorCaptureFailed", [errorMsg]));
    return;
  }
  try {
    current = await loadCapture();
    if (!current?.dataUrl) {
      showEmpty();
      return;
    }
    const m = current.meta || {};
    metaEl.textContent = m.pageTitle || m.pageUrl || "";
    document.title = m.pageTitle ? `Screener — ${m.pageTitle}` : t("titleEditor");

    anno = new Annotator(stageEl);
    anno.onChange = (canUndo, canRedo) => {
      undoEl.disabled = !canUndo;
      redoEl.disabled = !canRedo;
    };
    anno.onZoom = (pct) => (zoomLabelEl.textContent = pct + "%");
    await anno.load(current.dataUrl);

    settings = await syncGet({ endpoint: "", token: "" });
    downloadEl.disabled = false;
    copyEl.disabled = false;
    applySubmitVisibility();
    wireToolbar();
    wireShortcuts();
  } catch (e) {
    showEmpty(t("couldNotOpenCapture", [e?.message || String(e)]));
  }
}

// Submit goes only to a configured endpoint — hide the button when there's none
// (Download and Copy still work). Re-evaluated whenever the endpoint changes.
function applySubmitVisibility() {
  const ok = !!settings.endpoint;
  submitEl.hidden = !ok;
  submitEl.disabled = !ok;
}

// Keep settings fresh if the user edits Options in another tab (or another
// signed-in device, when sync is on — those changes land in the sync area).
chrome.storage.onChanged.addListener(async (changes, area) => {
  const active = (await isSyncOn()) ? "sync" : "local";
  if (area !== active) return;
  if (changes.endpoint) settings.endpoint = changes.endpoint.newValue || "";
  if (changes.token) settings.token = changes.token.newValue || "";
  if (changes.endpoint) applySubmitVisibility();
});

downloadEl.addEventListener("click", download);
copyEl.addEventListener("click", copyImage);
submitEl.addEventListener("click", openSubmit);
submitCancelEl.addEventListener("click", closeSubmit);
submitSendEl.addEventListener("click", doSubmit);
openOptionsEl.addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("winClose").addEventListener("click", async () => {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch {
    /* fall back to window.close() */
  }
  window.close();
});
submitModalEl.addEventListener("click", (e) => {
  if (e.target === submitModalEl) closeSubmit();
});
ticketTitleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    doSubmit();
  } else if (e.key === "Escape") {
    closeSubmit();
  }
});
ticketDescEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSubmit();
});

localize();
wireTheme(document.getElementById("theme-toggle"));
loadTheme();
init();
