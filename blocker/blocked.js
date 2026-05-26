import { localize } from "./i18n.js";

// --- theme (no toggle on this page; just honor the saved/OS preference) ---
const osThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
async function loadTheme() {
  const { theme } = await chrome.storage.local.get({ theme: null });
  const isDark = theme === "dark" || (theme == null && osThemeMedia.matches);
  document.documentElement.classList.toggle("dark", isDark);
  document.body.classList.remove("invisible");
}

// Only action left is Go back: step out of history, or close the tab if this
// block page is the first entry.
document.getElementById("back").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else window.close();
});

// Show a custom message if one is set — the admin's managed policy wins (locked
// kiosk text), else the user's own from Options; empty falls back to the default
// already rendered by localize().
async function loadMessage() {
  let custom = "";
  try {
    const { blockMessage = "" } = await chrome.storage.managed.get({ blockMessage: "" });
    custom = blockMessage;
  } catch {
    /* unmanaged */
  }
  if (!custom) {
    const { blockMessage = "" } = await chrome.storage.local.get({ blockMessage: "" });
    custom = blockMessage;
  }
  if (custom && custom.trim()) document.getElementById("blockedBody").textContent = custom;
}

localize();
loadTheme();
loadMessage();
