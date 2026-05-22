import { loadTheme, wireTheme } from "./theme.js";
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

async function save() {
  const endpoint = endpointEl.value.trim();
  const token = tokenEl.value.trim();
  if (endpoint && !isValidHttpUrl(endpoint)) {
    flash("Enter a valid http(s) URL.", false);
    return;
  }
  await chrome.storage.local.set({ endpoint, token });
  flash("Saved.");
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

wireTheme(document.getElementById("theme-toggle"));
loadTheme();
load();
