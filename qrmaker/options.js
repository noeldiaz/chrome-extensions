import { initTheme } from "./theme.js";
import { localize } from "./i18n.js";

const $ = (id) => document.getElementById(id);

// Placeholder options page — settings will be added here later. For now it just
// shares the theme + localization wiring used by the rest of the extension.
localize();
initTheme({ toggle: $("theme-toggle"), moon: $("moon-icon"), sun: $("sun-icon") });

// Footer Close: shut this options tab (window.close is unreliable for a tab, so
// remove it by id, falling back if needed).
$("winClose").addEventListener("click", async () => {
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
