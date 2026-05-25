// Picker popup: pick a color from anywhere on screen with the native EyeDropper
// API, show it as a swatch + a set of formats (HEX/RGB/HSL/HSV/OKLCH/… + the
// nearest Tailwind color), plus a shade ramp and a WCAG contrast checker. Click
// any value to copy. A native <input type="color"> is the fallback where
// EyeDropper is unsupported (Firefox, Safari). Recent picks, favorites, the last
// pick, and preferences persist in chrome.storage.local.
import { initTheme } from "./theme.js";
import { localize, t } from "./i18n.js";
import { confirmDialog } from "./dialog.js";
import {
  normalizeHex,
  hexToRgb,
  rgbToHsl,
  rgbToHsv,
  rgbToOklab,
  rgbToOklch,
  formatRgb,
  formatHsl,
  formatHsv,
  formatRgba,
  formatHsla,
  formatOklch,
  contrastText,
  contrastRatio,
  wcagLevels,
  ramp,
  nearestTailwind,
  FORMATS,
  DEFAULT_FORMATS,
} from "./lib.js";
import { TAILWIND_COLORS } from "./palette.js";

const MAX_RECENT = 12;
const MAX_FAVS = 100;

let hexUpper = true; // HEX letter case (options)
let visibleFormats = { ...DEFAULT_FORMATS }; // which rows show (options)
let copyOnPick = ""; // format key to auto-copy after a pick, or "" (options)
let favorites = []; // [{ hex, name }]
let current = null; // formatted strings + _hex/_rgb/_twHex
let statusTimer = null;

const fmtHex = (hex) => (hexUpper ? hex.toUpperCase() : hex.toLowerCase());

// Display form for a value pill: drop the redundant `fn(...)` wrapper (the pill's
// label already names the format) and show just the inside. The full string is
// still what gets copied.
const stripFn = (s) => {
  const m = /^[a-z]+\((.*)\)$/i.exec(s);
  return m ? m[1] : s;
};

const els = {
  pick: document.getElementById("pick"),
  noEd: document.getElementById("noEd"),
  swatch: document.getElementById("swatch"),
  fav: document.getElementById("fav"),
  favIco: document.getElementById("fav-ico"),
  values: document.getElementById("values"),
  otherValues: document.getElementById("otherValues"),
  formatsSection: document.getElementById("formats"),
  otherSection: document.getElementById("otherFormats"),
  ramp: document.getElementById("ramp"),
  cbg: document.getElementById("cbg"),
  cbgPick: document.getElementById("cbgPick"),
  cratio: document.getElementById("cratio"),
  cpreview: document.getElementById("cpreview"),
  cbadges: document.getElementById("cbadges"),
  native: document.getElementById("native"),
  favWrap: document.getElementById("favWrap"),
  favList: document.getElementById("favList"),
  favExport: document.getElementById("favExport"),
  favImport: document.getElementById("favImport"),
  favFile: document.getElementById("favFile"),
  recentWrap: document.getElementById("recentWrap"),
  recent: document.getElementById("recent"),
  clearRecent: document.getElementById("clearRecent"),
  status: document.getElementById("status"),
  tabBtns: document.querySelectorAll(".tab-btn"),
  panels: {
    color: document.getElementById("panel-color"),
    page: document.getElementById("panel-page"),
    tools: document.getElementById("panel-tools"),
  },
  scanBtn: document.getElementById("scanPage"),
  pageMsg: document.getElementById("pageMsg"),
  pageColors: document.getElementById("pageColors"),
};

const rowEls = {};

const X_ICO = `<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`;

const svgEl = (markup) => {
  const tpl = document.createElement("template");
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
};

function flash(msg) {
  els.status.textContent = msg;
  els.status.classList.remove("hidden");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => els.status.classList.add("hidden"), 1600);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    flash(t("copied"));
  } catch (e) {
    flash(t("errCopy", String(e?.message || e)));
  }
}

// Flash a chip green to confirm it was copied.
function markCopied(chip) {
  chip.classList.add("is-copied");
  clearTimeout(chip._t);
  chip._t = setTimeout(() => chip.classList.remove("is-copied"), 1200);
}

// All format strings for a hex, plus internals (_hex normalized, _rgb, _twHex).
function values(hex) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  const tw = nearestTailwind(rgb, TAILWIND_COLORS);
  const H = fmtHex(hex);
  return {
    _hex: hex,
    _rgb: rgb,
    _twHex: tw.hex,
    hex: H,
    rgb: formatRgb(rgb),
    hsl: formatHsl(hsl),
    hsv: formatHsv(rgbToHsv(rgb)),
    oklch: formatOklch(rgbToOklch(rgb)),
    rgba: formatRgba(rgb),
    hsla: formatHsla(hsl),
    hex8: H + (hexUpper ? "FF" : "ff"),
    tw: tw.name,
  };
}

// Build every format row once, sending the chosen ("favorite") ones to the
// Favorite Formats section and the rest to Other Formats. Both stay populated so
// show() can update them all; empty sections are hidden.
function buildRows() {
  els.values.replaceChildren();
  els.otherValues.replaceChildren();
  for (const { key, tag, chip } of FORMATS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "val-chip";

    const lab = document.createElement("span");
    lab.className = "val-tag";
    lab.textContent = tag;
    btn.appendChild(lab);

    let chipEl = null;
    if (chip) {
      chipEl = document.createElement("span");
      chipEl.className = "h-3 w-3 shrink-0 rounded-sm border border-black/10 dark:border-white/20";
      btn.appendChild(chipEl);
    }
    const nameEl = document.createElement("span");
    nameEl.className = "min-w-0 flex-1 truncate font-mono";
    btn.appendChild(nameEl);

    btn.title = key === "tw" ? t("copyTw") : `${t("copy")} ${tag}`;
    btn.setAttribute("aria-label", key === "tw" ? t("tailwindAria") : `${t("copy")} ${tag}`);
    btn.addEventListener("click", () => {
      if (!current) return;
      copy(current[key]);
      markCopied(btn);
    });

    (visibleFormats[key] ? els.values : els.otherValues).appendChild(btn);
    rowEls[key] = { nameEl, chipEl };
  }
  els.formatsSection.classList.toggle("hidden", !els.values.childElementCount);
  els.otherSection.classList.toggle("hidden", !els.otherValues.childElementCount);
}

function renderRamp(rgb) {
  const items = ramp(rgb);
  // Mark the swatch nearest the picked color (OKLab distance).
  const q = rgbToOklab(rgb);
  let activeIdx = 0;
  let bd = Infinity;
  items.forEach((s, i) => {
    const o = rgbToOklab(hexToRgb(s.hex));
    const d = (q.L - o.L) ** 2 + (q.a - o.a) ** 2 + (q.b - o.b) ** 2;
    if (d < bd) {
      bd = d;
      activeIdx = i;
    }
  });
  els.ramp.replaceChildren(
    ...items.map(({ step, hex }, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className =
        "relative h-8 flex-1 transition hover:scale-y-125 focus:outline-none focus:ring-2 focus:ring-blue-400 first:rounded-l-md last:rounded-r-md";
      b.style.background = hex;
      if (i === activeIdx) {
        // inset ring in a contrasting color + the matching step number
        const txt = contrastText(hexToRgb(hex));
        b.style.boxShadow = `inset 0 0 0 2px ${txt}`;
        b.style.color = txt;
        b.style.zIndex = "10";
        b.textContent = String(step);
        b.classList.add("flex", "items-center", "justify-center", "text-[9px]", "font-bold", "tabular-nums");
        b.setAttribute("aria-current", "true");
        b.title = `${step} · ${fmtHex(hex)} — ${t("shadeCurrent")}`;
        b.setAttribute("aria-label", `${step} ${fmtHex(hex)} ${t("shadeCurrent")}`);
      } else {
        b.title = `${step} · ${fmtHex(hex)}`;
        b.setAttribute("aria-label", `${step} ${fmtHex(hex)}`);
      }
      b.addEventListener("click", () => show(hex));
      return b;
    }),
  );
}

function renderBadges(lv) {
  const defs = [
    ["AA", t("normalText"), lv.aaNormal],
    ["AAA", t("normalText"), lv.aaaNormal],
    ["AA", t("largeText"), lv.aaLarge],
    ["AAA", t("largeText"), lv.aaaLarge],
  ];
  els.cbadges.replaceChildren(
    ...defs.map(([lbl, sub, ok]) => {
      const d = document.createElement("div");
      d.className =
        "rounded-md py-1 " +
        (ok
          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
          : "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300");
      const a = document.createElement("div");
      a.textContent = lbl;
      const c = document.createElement("div");
      c.className = "text-[9px] font-normal opacity-80";
      c.textContent = sub;
      d.append(a, c);
      return d;
    }),
  );
}

function updateContrast() {
  if (!current) return;
  const bg = hexToRgb(els.cbg.value) || { r: 255, g: 255, b: 255 };
  const ratio = contrastRatio(current._rgb, bg);
  els.cratio.textContent = `${ratio.toFixed(2)} : 1`;
  els.cpreview.style.background = els.cbg.value;
  els.cpreview.style.color = current._hex;
  renderBadges(wcagLevels(ratio));
}

// --- favorites (storage.local: { favorites: [{hex, name}] }) ---

const isFav = (hex) => favorites.some((f) => f.hex === hex);

function updateStar() {
  const on = current && isFav(current._hex);
  els.favIco.setAttribute("fill", on ? "currentColor" : "none");
  els.fav.classList.toggle("text-amber-500", !!on);
  els.fav.classList.toggle("text-slate-400", !on);
  els.fav.title = on ? t("favRemove") : t("favSave");
  els.fav.setAttribute("aria-label", els.fav.title);
}

async function saveFavs() {
  await chrome.storage.local.set({ favorites });
}

function renderFavs() {
  els.favWrap.classList.toggle("hidden", !favorites.length);
  els.favList.replaceChildren(
    ...favorites.map((f) => {
      const row = document.createElement("div");
      row.className = "flex items-center gap-2";

      const sw = document.createElement("button");
      sw.type = "button";
      sw.className =
        "h-6 w-6 shrink-0 rounded-md border border-slate-300 shadow-sm transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600";
      sw.style.background = f.hex;
      sw.title = fmtHex(f.hex);
      sw.setAttribute("aria-label", `${t("favLoad")} ${fmtHex(f.hex)}`);
      sw.addEventListener("click", () => show(f.hex));

      const name = document.createElement("input");
      name.type = "text";
      name.value = f.name;
      name.placeholder = fmtHex(f.hex);
      name.className =
        "min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-700 hover:border-slate-300 focus:border-blue-400 focus:bg-white focus:outline-none dark:text-slate-200 dark:hover:border-slate-600 dark:focus:bg-slate-900";
      name.addEventListener("change", () => {
        f.name = name.value;
        saveFavs();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.title = t("favRemove");
      del.setAttribute("aria-label", t("favRemove"));
      del.className = "shrink-0 rounded p-1 text-slate-400 transition hover:text-red-500 focus:outline-none";
      del.appendChild(svgEl(X_ICO));
      del.addEventListener("click", () => removeFav(f.hex));

      row.append(sw, name, del);
      return row;
    }),
  );
}

async function toggleFav() {
  if (!current) return;
  const hex = current._hex;
  if (isFav(hex)) {
    if (!(await confirmRemoveFav())) return;
    favorites = favorites.filter((f) => f.hex !== hex);
  } else {
    favorites = [{ hex, name: current.tw || "" }, ...favorites].slice(0, MAX_FAVS);
  }
  await saveFavs();
  renderFavs();
  updateStar();
}

const confirmRemoveFav = () =>
  confirmDialog({ message: t("favRemoveConfirm"), confirmText: t("remove"), cancelText: t("cancel") });

async function removeFav(hex) {
  if (!(await confirmRemoveFav())) return;
  favorites = favorites.filter((f) => f.hex !== hex);
  await saveFavs();
  renderFavs();
  updateStar();
}

function exportFavs() {
  if (!favorites.length) return;
  const blob = new Blob([JSON.stringify(favorites, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "picker-favorites.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFavs(file) {
  try {
    const data = JSON.parse(await file.text());
    const clean = (Array.isArray(data) ? data : [])
      .map((x) => ({ hex: normalizeHex(x?.hex), name: String(x?.name ?? "") }))
      .filter((x) => x.hex);
    const seen = new Set();
    favorites = [...clean, ...favorites]
      .filter((f) => (seen.has(f.hex) ? false : seen.add(f.hex)))
      .slice(0, MAX_FAVS);
    await saveFavs();
    renderFavs();
    updateStar();
    flash(t("favImported", String(clean.length)));
  } catch (e) {
    flash(t("errImport", String(e?.message || e)));
  }
}

// --- recent picks (storage.local: { recent: ["#rrggbb", …] }) ---

function renderRecent(list) {
  els.recentWrap.classList.toggle("hidden", !list.length);
  els.recent.replaceChildren(
    ...list.map((hex) => {
      const wrap = document.createElement("div");
      wrap.className = "group relative";

      const b = document.createElement("button");
      b.type = "button";
      b.title = fmtHex(hex);
      b.setAttribute("aria-label", `${t("favLoad")} ${fmtHex(hex)}`);
      b.className =
        "h-7 w-7 rounded-md border border-slate-300 shadow-sm transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600";
      b.style.background = hex;
      b.addEventListener("click", () => show(hex));

      // hover/focus ✕ to remove just this color
      const del = document.createElement("button");
      del.type = "button";
      del.title = t("recentRemove");
      del.setAttribute("aria-label", `${t("recentRemove")} ${fmtHex(hex)}`);
      del.className =
        "absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white shadow transition hover:bg-red-600 focus:flex focus:outline-none group-hover:flex";
      del.innerHTML =
        '<svg class="h-2.5 w-2.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>';
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        removeRecent(hex);
      });

      wrap.append(b, del);
      return wrap;
    }),
  );
}

async function removeRecent(hex) {
  const ok = await confirmDialog({
    message: t("recentRemoveConfirm"),
    confirmText: t("remove"),
    cancelText: t("cancel"),
  });
  if (!ok) return;
  const { recent = [] } = await chrome.storage.local.get({ recent: [] });
  const next = recent.filter((c) => c !== hex);
  await chrome.storage.local.set({ recent: next });
  renderRecent(next);
}

async function pushRecent(hex) {
  const { recent = [] } = await chrome.storage.local.get({ recent: [] });
  const next = [hex, ...recent.filter((c) => c !== hex)].slice(0, MAX_RECENT);
  await chrome.storage.local.set({ recent: next });
  renderRecent(next);
}

// Render a hex into the swatch, value rows, ramp, contrast, and star.
function show(hexInput) {
  const hex = normalizeHex(hexInput);
  if (!hex) return false;
  current = values(hex);

  els.swatch.style.background = hex;
  els.swatch.style.color = contrastText(current._rgb);
  els.swatch.textContent = current.hex;

  for (const { key } of FORMATS) {
    const r = rowEls[key];
    r.nameEl.textContent = stripFn(current[key]);
    if (r.chipEl) r.chipEl.style.background = current._twHex;
  }

  renderRamp(current._rgb);
  updateContrast();
  updateStar();
  els.native.value = hex;
  return true;
}

// --- tabs + page-color extraction ---

let pageScanned = false;

function switchTab(name) {
  for (const b of els.tabBtns) b.classList.toggle("is-active", b.dataset.tab === name);
  for (const [k, panel] of Object.entries(els.panels)) panel.classList.toggle("hidden", k !== name);
  if (name === "page" && !pageScanned) scanPage();
}

function pageNote(msg) {
  els.pageMsg.textContent = msg;
  els.pageMsg.classList.remove("hidden");
}

// Runs in the inspected page (no closures) — collect the most-used colors from
// computed styles and return them as { hex, count }, most common first.
function collectColors() {
  const counts = new Map();
  const add = (c) => {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c || "");
    if (!m || (m[4] !== undefined && parseFloat(m[4]) < 0.5)) return;
    const hex = "#" + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, "0")).join("");
    counts.set(hex, (counts.get(hex) || 0) + 1);
  };
  const nodes = document.querySelectorAll("*");
  const cap = Math.min(nodes.length, 9000);
  for (let i = 0; i < cap; i++) {
    const s = getComputedStyle(nodes[i]);
    add(s.color);
    add(s.backgroundColor);
    add(s.borderTopColor);
    add(s.borderRightColor);
    add(s.borderBottomColor);
    add(s.borderLeftColor);
    add(s.fill);
    add(s.stroke);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([hex, count]) => ({ hex, count }));
}

function renderPageColors(colors) {
  els.pageColors.replaceChildren(
    ...colors.map(({ hex, count }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className =
        "h-8 w-full rounded-md border border-slate-300 shadow-sm transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600";
      b.style.background = hex;
      b.title = `${fmtHex(hex)} · ${count}`;
      b.setAttribute("aria-label", fmtHex(hex));
      b.addEventListener("click", () => {
        show(hex);
        switchTab("color");
      });
      return b;
    }),
  );
}

async function scanPage() {
  pageScanned = true;
  els.pageMsg.classList.add("hidden");
  els.pageColors.replaceChildren();
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    /* no tab */
  }
  if (!tab?.id) {
    pageNote(t("pageErr"));
    return;
  }
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectColors });
    const colors = res?.result || [];
    if (!colors.length) pageNote(t("pageEmpty"));
    else renderPageColors(colors);
  } catch {
    pageNote(t("pageErr")); // restricted page (chrome://, Web Store, etc.)
  }
}

// Record a freshly picked/chosen color: render it and remember it.
async function record(hexInput) {
  const hex = normalizeHex(hexInput);
  if (!hex || !show(hex)) return;
  await pushRecent(hex);
}

async function openEyeDropper() {
  return new EyeDropper().open();
}

async function pick() {
  if (!("EyeDropper" in window)) return;
  try {
    const { sRGBHex } = await openEyeDropper();
    await record(sRGBHex);
    if (copyOnPick && current) copy(current[copyOnPick]);
  } catch (e) {
    if (e?.name === "AbortError") flash(t("pickCancelled"));
    else flash(t("errPick", String(e?.message || e)));
  }
}

async function pickInto(input) {
  if (!("EyeDropper" in window)) return;
  try {
    const { sRGBHex } = await openEyeDropper();
    input.value = sRGBHex;
    updateContrast();
  } catch (e) {
    if (e?.name !== "AbortError") flash(t("errPick", String(e?.message || e)));
  }
}

async function loadState() {
  const store = await chrome.storage.local.get({
    recent: [],
    favorites: [],
    hexUpper: true,
    formats: DEFAULT_FORMATS,
    copyOnPick: "",
  });
  hexUpper = store.hexUpper;
  visibleFormats = { ...DEFAULT_FORMATS, ...store.formats };
  copyOnPick = store.copyOnPick;
  favorites = store.favorites;

  buildRows();
  renderFavs();
  renderRecent(store.recent);
  // Always show a color so the Formats / Shades / Contrast sections are visible
  // on open: restore the last pick, else the first favorite, else the default.
  show(store.recent[0] || favorites[0]?.hex || els.native.value);
}

function init() {
  localize();
  initTheme({
    toggle: document.getElementById("theme-toggle"),
    moon: document.getElementById("moon-icon"),
    sun: document.getElementById("sun-icon"),
  });

  if ("EyeDropper" in window) {
    els.pick.addEventListener("click", pick);
    els.cbgPick.addEventListener("click", () => pickInto(els.cbg));
  } else {
    els.pick.disabled = true;
    els.noEd.classList.remove("hidden");
    els.cbgPick.classList.add("hidden");
  }

  els.swatch.addEventListener("click", () => current && copy(current.hex));
  els.fav.addEventListener("click", toggleFav);
  els.cbg.addEventListener("input", updateContrast);
  els.native.addEventListener("input", () => show(els.native.value));
  els.native.addEventListener("change", () => record(els.native.value));

  els.favExport.addEventListener("click", exportFavs);
  els.favImport.addEventListener("click", () => els.favFile.click());
  els.favFile.addEventListener("change", () => {
    if (els.favFile.files[0]) importFavs(els.favFile.files[0]);
    els.favFile.value = "";
  });

  for (const b of els.tabBtns) b.addEventListener("click", () => switchTab(b.dataset.tab));
  els.scanBtn.addEventListener("click", scanPage);

  document
    .getElementById("settings")
    .addEventListener("click", () => chrome.runtime.openOptionsPage());

  els.clearRecent.addEventListener("click", async () => {
    const ok = await confirmDialog({
      message: t("clearRecentConfirm"),
      confirmText: t("confirmClear"),
      cancelText: t("cancel"),
    });
    if (!ok) return;
    await chrome.storage.local.set({ recent: [] });
    renderRecent([]);
  });

  loadState();
}

init();
