// Picker popup: pick a colour from anywhere on screen with the native EyeDropper
// API, show it as a swatch + HEX/RGB/HSL/HSV + the nearest Tailwind colour, and
// copy any value in one click. A native <input type="color"> is the fallback
// where EyeDropper is unsupported (Firefox, Safari). Recent picks persist in
// chrome.storage.local and the last pick is restored when the popup reopens.
import { initTheme } from "./theme.js";
import { localize, t } from "./i18n.js";
import {
  normalizeHex,
  hexToRgb,
  rgbToHsl,
  rgbToHsv,
  formatRgb,
  formatHsl,
  formatHsv,
  contrastText,
  nearestTailwind,
} from "./lib.js";
import { TAILWIND_COLORS } from "./palette.js";

const MAX_RECENT = 12;

// HEX letter case, set on the options page (storage.local "hexUpper"). All hex
// passed around here is canonical lowercase; this only changes how it's shown.
let hexUpper = true;
const fmtHex = (hex) => (hexUpper ? hex.toUpperCase() : hex.toLowerCase());

const els = {
  pick: document.getElementById("pick"),
  noEd: document.getElementById("noEd"),
  result: document.getElementById("result"),
  swatch: document.getElementById("swatch"),
  values: document.getElementById("values"),
  hint: document.getElementById("hint"),
  native: document.getElementById("native"),
  recentWrap: document.getElementById("recentWrap"),
  recent: document.getElementById("recent"),
  clearRecent: document.getElementById("clearRecent"),
  status: document.getElementById("status"),
};

// Value rows, in display order. `key` indexes into `current`; `chip` rows show a
// small colour swatch (used for the nearest-Tailwind row).
const ROWS = [
  { key: "hex", label: "HEX" },
  { key: "rgb", label: "RGB" },
  { key: "hsl", label: "HSL" },
  { key: "hsv", label: "HSV" },
  { key: "tw", label: "TW", chip: true },
];
const rowEls = {};
let current = null; // { hex, rgb, hsl, hsv, tw } — all formatted strings
let statusTimer = null;

const COPY_ICO = `<svg class="copy-ico h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m0 0H6.75m0 0v3.75" /></svg>`;
const CHECK_ICO = `<svg class="check-ico hidden h-4 w-4 shrink-0 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`;

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

// Briefly swap a row's copy icon for a green check, at the point of action.
function markCopied(copyIco, checkIco) {
  copyIco.classList.add("hidden");
  checkIco.classList.remove("hidden");
  clearTimeout(checkIco._t);
  checkIco._t = setTimeout(() => {
    copyIco.classList.remove("hidden");
    checkIco.classList.add("hidden");
  }, 1200);
}

function buildRows() {
  for (const { key, label, chip } of ROWS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "val-row";

    const lab = document.createElement("span");
    lab.className = "val-label";
    lab.textContent = label;

    const val = document.createElement("span");
    val.className = "val-text";
    let chipEl = null;
    let nameEl = val;
    if (chip) {
      val.classList.add("flex", "items-center", "gap-2");
      chipEl = document.createElement("span");
      chipEl.className = "h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10 dark:border-white/20";
      nameEl = document.createElement("span");
      nameEl.className = "truncate";
      val.append(chipEl, nameEl);
    }

    const copyIco = svgEl(COPY_ICO);
    const checkIco = svgEl(CHECK_ICO);
    btn.append(lab, val, copyIco, checkIco);

    btn.title = key === "tw" ? t("copyTw") : `${t("copy")} ${label}`;
    btn.setAttribute("aria-label", key === "tw" ? t("tailwindAria") : `${t("copy")} ${label}`);
    btn.addEventListener("click", () => {
      if (!current) return;
      copy(current[key]);
      markCopied(copyIco, checkIco);
    });

    els.values.appendChild(btn);
    rowEls[key] = { nameEl, chipEl };
  }
}

// Render a hex into the swatch + value rows. Returns false for invalid input.
function show(hexInput) {
  const hex = normalizeHex(hexInput);
  if (!hex) return false;
  const rgb = hexToRgb(hex);
  const tw = nearestTailwind(rgb, TAILWIND_COLORS);
  current = {
    hex: fmtHex(hex),
    rgb: formatRgb(rgb),
    hsl: formatHsl(rgbToHsl(rgb)),
    hsv: formatHsv(rgbToHsv(rgb)),
    tw: tw.name,
  };

  els.swatch.style.background = hex;
  els.swatch.style.color = contrastText(rgb);
  els.swatch.textContent = current.hex;

  rowEls.hex.nameEl.textContent = current.hex;
  rowEls.rgb.nameEl.textContent = current.rgb;
  rowEls.hsl.nameEl.textContent = current.hsl;
  rowEls.hsv.nameEl.textContent = current.hsv;
  rowEls.tw.nameEl.textContent = tw.name;
  rowEls.tw.chipEl.style.background = tw.hex;

  els.result.classList.remove("hidden");
  els.hint.classList.add("hidden");
  els.native.value = hex;
  return true;
}

// --- recent picks (storage.local: { recent: ["#rrggbb", …] }) ---

async function loadState() {
  const { recent = [], hexUpper: hu = true } = await chrome.storage.local.get({
    recent: [],
    hexUpper: true,
  });
  hexUpper = hu;
  renderRecent(recent);
  if (recent.length) show(recent[0]); // restore the last pick on open
}

function renderRecent(list) {
  els.recent.replaceChildren();
  if (!list.length) {
    els.recentWrap.classList.add("hidden");
    return;
  }
  els.recentWrap.classList.remove("hidden");
  for (const hex of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.title = fmtHex(hex);
    b.setAttribute("aria-label", fmtHex(hex));
    b.className =
      "h-7 w-7 rounded-md border border-slate-300 shadow-sm transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600";
    b.style.background = hex;
    b.addEventListener("click", () => show(hex));
    els.recent.appendChild(b);
  }
}

async function pushRecent(hex) {
  const { recent = [] } = await chrome.storage.local.get({ recent: [] });
  const next = [hex, ...recent.filter((c) => c !== hex)].slice(0, MAX_RECENT);
  await chrome.storage.local.set({ recent: next });
  renderRecent(next);
}

// Record a freshly picked/chosen colour: render it and remember it.
async function record(hexInput) {
  const hex = normalizeHex(hexInput);
  if (!hex || !show(hex)) return;
  await pushRecent(hex);
}

async function pick() {
  if (!("EyeDropper" in window)) return;
  try {
    const { sRGBHex } = await new EyeDropper().open();
    await record(sRGBHex);
  } catch (e) {
    // The user pressing Esc rejects with an AbortError — not an error to show.
    if (e?.name === "AbortError") flash(t("pickCancelled"));
    else flash(t("errPick", String(e?.message || e)));
  }
}

function init() {
  localize();
  initTheme({
    toggle: document.getElementById("theme-toggle"),
    moon: document.getElementById("moon-icon"),
    sun: document.getElementById("sun-icon"),
  });
  buildRows();

  if ("EyeDropper" in window) {
    els.pick.addEventListener("click", pick);
  } else {
    els.pick.disabled = true;
    els.noEd.classList.remove("hidden");
  }

  els.swatch.addEventListener("click", () => current && copy(current.hex));
  els.native.addEventListener("input", () => show(els.native.value)); // live preview
  els.native.addEventListener("change", () => record(els.native.value)); // commit to recent

  document
    .getElementById("settings")
    .addEventListener("click", () => chrome.runtime.openOptionsPage());

  els.clearRecent.addEventListener("click", async () => {
    await chrome.storage.local.set({ recent: [] });
    renderRecent([]);
  });

  loadState();
}

init();
