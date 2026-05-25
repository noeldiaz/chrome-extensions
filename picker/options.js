// Picker settings page. Persists preferences in chrome.storage.local; the popup
// reads them on open. Shares the theme + localization wiring (workspace pattern).
import { initTheme } from "./theme.js";
import { localize, t } from "./i18n.js";

const $ = (id) => document.getElementById(id);

let statusTimer = null;
function flash(msg) {
  $("status").textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => ($("status").textContent = ""), 1600);
}

async function refreshRecentHint() {
  const { recent = [] } = await chrome.storage.local.get({ recent: [] });
  $("recentHint").textContent = t("optRecentHint", String(recent.length));
}

async function init() {
  localize();
  initTheme({ toggle: $("theme-toggle"), moon: $("moon-icon"), sun: $("sun-icon") });

  // HEX letter case
  const { hexUpper = true } = await chrome.storage.local.get({ hexUpper: true });
  $("hexCase").value = hexUpper ? "upper" : "lower";
  $("hexCase").addEventListener("change", async (e) => {
    await chrome.storage.local.set({ hexUpper: e.target.value === "upper" });
  });

  // Recent colours
  await refreshRecentHint();
  $("clearRecent").addEventListener("click", async () => {
    await chrome.storage.local.set({ recent: [] });
    await refreshRecentHint();
    flash(t("optCleared"));
  });

  // Footer Close: remove this options tab (window.close is unreliable for a tab).
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
}

init();
