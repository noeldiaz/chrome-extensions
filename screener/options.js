import { loadTheme, wireTheme } from "./theme.js";
import { localize, t } from "./i18n.js";
import { isValidHttpUrl } from "./lib.js";

const endpointEl = document.getElementById("endpoint");
const tokenEl = document.getElementById("token");
const saveEl = document.getElementById("save");
const statusEl = document.getElementById("status");

let statusTimer = null;
function flash(message, ok = true) {
  statusEl.textContent = message;
  statusEl.classList.toggle("text-green-600", ok);
  statusEl.classList.toggle("dark:text-green-400", ok);
  statusEl.classList.toggle("text-red-500", !ok);
  statusEl.classList.toggle("dark:text-red-400", !ok);
  clearTimeout(statusTimer);
  if (ok) statusTimer = setTimeout(() => (statusEl.textContent = ""), 2500);
}

// http to a non-local host sends the bearer token in cleartext.
function isInsecure(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && !/^(localhost|127\.|\[?::1)/.test(u.hostname);
  } catch {
    return false;
  }
}

async function save() {
  const endpoint = endpointEl.value.trim();
  const token = tokenEl.value.trim();
  if (endpoint && !isValidHttpUrl(endpoint)) {
    flash(t("enterValidUrl"), false);
    return;
  }
  await chrome.storage.local.set({ endpoint, token });
  if (token && isInsecure(endpoint)) {
    flash(t("savedInsecure"), false);
  } else {
    flash(t("saved"));
  }
}

async function load() {
  const { endpoint, token } = await chrome.storage.local.get({ endpoint: "", token: "" });
  endpointEl.value = endpoint;
  tokenEl.value = token;
}

saveEl.addEventListener("click", save);
for (const el of [endpointEl, tokenEl]) {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  });
}

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

localize();
wireTheme(document.getElementById("theme-toggle"));
loadTheme();
load();
