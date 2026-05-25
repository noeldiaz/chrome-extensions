// Picker settings page. Persists preferences in chrome.storage.local; the popup
// reads them on open. Shares the theme + localization wiring (workspace pattern).
import { initTheme } from "./theme.js";
import { localize, t } from "./i18n.js";
import { confirmDialog } from "./dialog.js";
import { FORMATS, DEFAULT_FORMATS } from "./lib.js";
import { syncGet, syncSet, isSyncOn, setSyncEnabled } from "./sync.js";
import { TAILWIND_VERSION, TAILWIND_COLORS } from "./palette.js";

const $ = (id) => document.getElementById(id);

let statusTimer = null;
function flash(msg) {
  $("status").textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => ($("status").textContent = ""), 1600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    flash(t("copied"));
  } catch {
    /* ignore */
  }
}

function recentChip(hex) {
  const label = $("hexCase").value === "upper" ? hex.toUpperCase() : hex.toLowerCase();

  const chip = document.createElement("div");
  chip.className =
    "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900";

  const sw = document.createElement("button");
  sw.type = "button";
  sw.className = "h-5 w-5 shrink-0 rounded border border-black/10 dark:border-white/20";
  sw.style.background = hex;
  sw.title = `${t("copy")} ${label}`;
  sw.setAttribute("aria-label", `${t("copy")} ${label}`);
  sw.addEventListener("click", () => copyText(label));

  const name = document.createElement("span");
  name.className = "font-mono text-sm text-slate-700 dark:text-slate-200";
  name.textContent = label;

  const del = document.createElement("button");
  del.type = "button";
  del.title = t("recentRemove");
  del.setAttribute("aria-label", `${t("recentRemove")} ${label}`);
  del.className = "ml-auto rounded p-0.5 text-slate-400 transition hover:text-red-500 focus:outline-none";
  del.innerHTML =
    '<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>';
  del.addEventListener("click", () => removeRecentColor(hex));

  chip.append(sw, name, del);
  return chip;
}

async function removeRecentColor(hex) {
  const ok = await confirmDialog({
    message: t("recentRemoveConfirm"),
    confirmText: t("remove"),
    cancelText: t("cancel"),
  });
  if (!ok) return;
  const { recent = [] } = await syncGet({ recent: [] });
  await syncSet({ recent: recent.filter((c) => c !== hex) });
  renderRecentList();
}

async function renderRecentList() {
  const { recent = [] } = await syncGet({ recent: [] });
  $("recentHint").textContent = t("optRecentHint", String(recent.length));
  $("clearRecent").classList.toggle("hidden", !recent.length);
  $("recentList").replaceChildren(...recent.map(recentChip));
}

// Format-visibility checkboxes, built from the shared FORMATS list.
async function buildFormatToggles() {
  const { formats = DEFAULT_FORMATS } = await syncGet({ formats: DEFAULT_FORMATS });
  const visible = { ...DEFAULT_FORMATS, ...formats };
  // Show checked (favorite) formats first; stable sort keeps FORMATS order within
  // each group. Only sorts on open, so toggling doesn't make checkboxes jump.
  const ordered = [...FORMATS].sort((a, b) => (visible[b.key] ? 1 : 0) - (visible[a.key] ? 1 : 0));
  $("formatList").replaceChildren(
    ...ordered.map(({ key, label }) => {
      const lab = document.createElement("label");
      lab.className = "flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!visible[key];
      cb.className = "h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900";
      cb.addEventListener("change", async () => {
        visible[key] = cb.checked;
        await syncSet({ formats: visible });
      });
      const span = document.createElement("span");
      span.textContent = label;
      lab.append(cb, span);
      return lab;
    }),
  );
}

// "Copy on pick" dropdown: Off + every format.
async function buildCopyOnPick() {
  const { copyOnPick = "" } = await syncGet({ copyOnPick: "" });
  const sel = $("copyOnPick");
  const off = new Option(t("copyOff") || "Don’t auto-copy", "");
  sel.append(off, ...FORMATS.map(({ key, label }) => new Option(label, key)));
  sel.value = copyOnPick;
  sel.addEventListener("change", async () => {
    await syncSet({ copyOnPick: sel.value });
  });
}

async function init() {
  localize();
  initTheme({ toggle: $("theme-toggle"), moon: $("moon-icon"), sun: $("sun-icon") });

  // HEX letter case
  const { hexUpper = true } = await syncGet({ hexUpper: true });
  $("hexCase").value = hexUpper ? "upper" : "lower";
  $("hexCase").addEventListener("change", async (e) => {
    await syncSet({ hexUpper: e.target.value === "upper" });
    renderRecentList(); // re-case the swatch labels
  });

  // Sync across devices (opt-in). Toggling migrates the synced data, then we
  // reload so every section reflects the now-active storage area.
  $("syncToggle").checked = await isSyncOn();
  $("syncToggle").addEventListener("change", async (e) => {
    const on = e.target.checked;
    try {
      await setSyncEnabled(on);
      location.reload();
    } catch (err) {
      e.target.checked = !on; // revert (e.g. over the sync quota)
      flash(t("optSyncErr", String(err?.message || err)));
    }
  });

  await buildFormatToggles();
  await buildCopyOnPick();

  // Recent colors
  await renderRecentList();
  $("clearRecent").addEventListener("click", async () => {
    const ok = await confirmDialog({
      message: t("clearRecentConfirm"),
      confirmText: t("confirmClear"),
      cancelText: t("cancel"),
    });
    if (!ok) return;
    await syncSet({ recent: [] });
    await renderRecentList();
    flash(t("optCleared"));
  });

  // Tailwind palette version (so you can tell when a new Tailwind ships new colors)
  $("twInfo").textContent = t("optTwLoaded", [TAILWIND_VERSION, String(TAILWIND_COLORS.length)]);

  // About: extension version
  $("aboutVersion").textContent = `${t("version")} ${chrome.runtime.getManifest().version}`;

  // Tabs: Settings / Recent Colors / About
  const opanels = {
    settings: $("opanel-settings"),
    recent: $("opanel-recent"),
    about: $("opanel-about"),
  };
  const tabs = document.querySelectorAll(".tab-btn");
  for (const b of tabs) {
    b.addEventListener("click", () => {
      for (const x of tabs) x.classList.toggle("is-active", x === b);
      for (const [k, p] of Object.entries(opanels)) p.classList.toggle("hidden", k !== b.dataset.tab);
    });
  }

  // Deep-link: the popup's "More" sets optionsTab to open a specific tab.
  const { optionsTab } = await chrome.storage.local.get({ optionsTab: "" });
  if (optionsTab) {
    await chrome.storage.local.remove("optionsTab");
    [...tabs].find((b) => b.dataset.tab === optionsTab)?.click();
  }

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
