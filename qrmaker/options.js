import { initTheme } from "./theme.js";
import { localize, t } from "./i18n.js";

const $ = (id) => document.getElementById(id);

// Placeholder options page — settings will be added here later. For now it just
// shares the theme + localization wiring used by the rest of the extension.
localize();
initTheme({ toggle: $("theme-toggle"), moon: $("moon-icon"), sun: $("sun-icon") });

// Tabs: Settings / About
$("aboutVersion").textContent = `${t("version")} ${chrome.runtime.getManifest().version}`;
const opanels = { settings: $("opanel-settings"), about: $("opanel-about") };
const tabBtns = document.querySelectorAll(".tab-btn");
for (const b of tabBtns)
  b.addEventListener("click", () => {
    for (const x of tabBtns) x.classList.toggle("is-active", x === b);
    for (const [k, p] of Object.entries(opanels)) p.classList.toggle("hidden", k !== b.dataset.tab);
  });

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
