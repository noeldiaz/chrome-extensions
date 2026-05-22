import { loadTheme, wireTheme } from "./theme.js";
import { captureFilename } from "./lib.js";

const imgEl = document.getElementById("shot");
const emptyEl = document.getElementById("empty");
const metaEl = document.getElementById("meta");
const downloadEl = document.getElementById("download");

const id = new URLSearchParams(location.search).get("id");
let current = null;

async function loadCapture() {
  if (!id) return null;
  const key = "capture:" + id;
  const obj = await chrome.storage.session.get(key);
  const data = obj[key];
  // Transient by design — drop it from session memory once we hold it here.
  if (data) await chrome.storage.session.remove(key);
  return data;
}

function render() {
  const has = Boolean(current?.dataUrl);
  imgEl.hidden = !has;
  emptyEl.hidden = has;
  downloadEl.disabled = !has;
  if (!has) return;

  imgEl.src = current.dataUrl;
  const m = current.meta || {};
  metaEl.textContent = m.pageTitle || m.pageUrl || "";
  document.title = `Screener — ${m.pageTitle || "Editor"}`;
}

async function download() {
  if (!current?.dataUrl) return;
  const m = current.meta || {};
  await chrome.downloads.download({
    url: current.dataUrl,
    filename: captureFilename(m.mode || "capture", Date.parse(m.capturedAt) || Date.now()),
    saveAs: true,
  });
}

downloadEl.addEventListener("click", download);
wireTheme(document.getElementById("theme-toggle"));
loadTheme();

(async () => {
  current = await loadCapture();
  render();
})();
