import { localize } from "./i18n.js";
import { initTheme } from "./theme.js";
import { initApp } from "./controllers.js";

localize();
initTheme({
  toggle: document.getElementById("theme-toggle"),
  moon: document.getElementById("moon-icon"),
  sun: document.getElementById("sun-icon"),
});

document.getElementById("expand").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
  window.close();
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

initApp({ mode: "compact" });
