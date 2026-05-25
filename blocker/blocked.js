import { baseDomain, hostFromUrl } from "./lib.js";
import { localize, t } from "./i18n.js";
import { syncGet, syncSet } from "./sync.js";

const from = new URLSearchParams(location.search).get("from") || "";
const host = hostFromUrl(from);
const base = host ? baseDomain(host) : null;

// --- theme (no toggle on this page; just honor the saved/OS preference) ---
const osThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
async function loadTheme() {
  const { theme } = await chrome.storage.local.get({ theme: null });
  const isDark = theme === "dark" || (theme == null && osThemeMedia.matches);
  document.documentElement.classList.toggle("dark", isDark);
  document.body.classList.remove("invisible");
}

const urlEl = document.getElementById("blockedUrl");
const allowEl = document.getElementById("allow");
const backEl = document.getElementById("back");
const stopEl = document.getElementById("stop");

urlEl.textContent = host || from || t("blockedUnknown");

// Without a parseable http host (or original URL) there's nothing to allow/return to.
if (!base) {
  allowEl.disabled = true;
  document.getElementById("allowLabel").textContent = t("blockedNothingToAllow");
}
if (!from) backEl.disabled = true;

allowEl.addEventListener("click", async () => {
  if (!base) return;
  const { allowed = [] } = await syncGet({ allowed: [] });
  if (!allowed.includes(base)) await syncSet({ allowed: [...allowed, base].sort() });
  location.href = from; // now allowed → the navigation passes through
});

backEl.addEventListener("click", () => {
  if (history.length > 1) history.back();
  else window.close();
});

stopEl.addEventListener("click", async () => {
  await chrome.storage.local.set({ blocking: false });
  if (from) location.href = from;
});

localize();
loadTheme();
