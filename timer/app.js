import { localize } from "./i18n.js";
import { initTheme } from "./theme.js";
import { initApp } from "./controllers.js";

localize();
initTheme({
  toggle: document.getElementById("theme-toggle"),
  moon: document.getElementById("moon-icon"),
  sun: document.getElementById("sun-icon"),
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Close button — close this tab, falling back to window.close().
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

initApp({ mode: "full" });
