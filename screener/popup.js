import { loadTheme, wireTheme } from "./theme.js";
import { PROTECTED_URL } from "./lib.js";

const statusEl = document.getElementById("status");
const capturesEl = document.getElementById("captures");

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function capture(mode) {
  const tab = await activeTab();
  if (!tab) return;

  // Full-screen targets the monitor, not the page, so it's allowed even on
  // chrome:// tabs. The page-based modes are not.
  if (mode !== "fullscreen" && PROTECTED_URL.test(tab.url || "")) {
    statusEl.textContent = "Can't capture this page.";
    return;
  }

  statusEl.textContent = mode === "fullpage" ? "Capturing full page…" : "";
  const send = chrome.runtime.sendMessage({
    type: "capture",
    mode,
    tab: { id: tab.id, windowId: tab.windowId, url: tab.url || "", title: tab.title || "" },
  });

  // Selection needs the user to click+drag the page, so the popup must close to
  // get out of the way. Background opens the editor (or quietly drops a cancel).
  if (mode === "selection") {
    window.close();
    return;
  }

  const res = await send;
  if (!res?.ok) {
    statusEl.textContent = res?.error || "Capture failed.";
    return;
  }
  window.close(); // editor tab is opening
}

capturesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mode]");
  if (btn) capture(btn.dataset.mode);
});

wireTheme(document.getElementById("theme-toggle"));
loadTheme();
