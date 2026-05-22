import { loadTheme, wireTheme } from "./theme.js";
import { captureFilename } from "./lib.js";
import { takeCapture } from "./idb.js";
import { Annotator } from "./annotator.js";

const stageEl = document.getElementById("stage");
const emptyEl = document.getElementById("empty");
const metaEl = document.getElementById("meta");
const toolbarEl = document.getElementById("toolbar");
const downloadEl = document.getElementById("download");
const undoEl = document.getElementById("undo");
const redoEl = document.getElementById("redo");
const deleteEl = document.getElementById("delete");

const params = new URLSearchParams(location.search);
const id = params.get("id");
const errorMsg = params.get("error");
let current = null;
let anno = null;

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
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable);
}

function wireShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (isTyping(e)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? anno.redo() : anno.undo();
    }
    if (e.key === "Delete" || e.key === "Backspace") return anno.deleteSelected();
    const map = { v: "select", r: "rect", a: "arrow", p: "pen", t: "text" };
    const name = map[e.key.toLowerCase()];
    if (name) activateTool(name);
  });
}

// --- outputs ---

async function download() {
  if (!anno) return;
  const m = current?.meta || {};
  await chrome.downloads.download({
    url: anno.toDataURL(),
    filename: captureFilename(m.mode || "capture", Date.parse(m.capturedAt) || Date.now()),
    saveAs: true,
  });
}

// --- boot ---

async function init() {
  if (errorMsg) {
    showEmpty(`Capture failed: ${errorMsg}`);
    return;
  }
  current = await loadCapture();
  if (!current?.dataUrl) {
    showEmpty();
    return;
  }
  const m = current.meta || {};
  metaEl.textContent = m.pageTitle || m.pageUrl || "";
  document.title = `Screener — ${m.pageTitle || "Editor"}`;

  anno = new Annotator(stageEl);
  anno.onChange = (canUndo, canRedo) => {
    undoEl.disabled = !canUndo;
    redoEl.disabled = !canRedo;
  };
  await anno.load(current.dataUrl);

  downloadEl.disabled = false;
  wireToolbar();
  wireShortcuts();
}

downloadEl.addEventListener("click", download);
wireTheme(document.getElementById("theme-toggle"));
loadTheme();
init();
