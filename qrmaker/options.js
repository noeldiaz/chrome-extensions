import { initTheme } from "./theme.js";
import { localize, t } from "./i18n.js";
import { isSyncOn, setSyncEnabled } from "./sync.js";

const $ = (id) => document.getElementById(id);

// QRmaker options page. Shares the theme + localization wiring used by the rest
// of the extension; the one setting so far is the opt-in cross-device sync.
localize();
initTheme({ toggle: $("theme-toggle"), moon: $("moon-icon"), sun: $("sun-icon") });

// Sync across devices (opt-in). Toggling migrates the synced presets, then we
// reload so the page reflects the now-active storage area.
(async () => {
  $("syncToggle").checked = await isSyncOn();
})();
$("syncToggle").addEventListener("change", async (e) => {
  const on = e.target.checked;
  try {
    await setSyncEnabled(on);
    location.reload();
  } catch (err) {
    e.target.checked = !on; // revert (e.g. over the sync quota)
    // eslint-disable-next-line no-console -- no on-page status element here yet
    console.error(t("optSyncErr", String(err?.message || err)));
  }
});

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
