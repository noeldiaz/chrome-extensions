// Picker popup: pick a colour from anywhere on screen with the native EyeDropper
// API, show it as a swatch + HEX/RGB/HSL, and copy any value in one click. A
// native <input type="color"> is the fallback where EyeDropper is unsupported
// (Firefox, Safari). Recent picks persist in chrome.storage.local.
import { initTheme } from "./theme.js";
import { localize, t } from "./i18n.js";
import {
  normalizeHex,
  hexToRgb,
  rgbToHsl,
  formatRgb,
  formatHsl,
  contrastText,
} from "./lib.js";

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
  hex: document.getElementById("hex"),
  rgb: document.getElementById("rgb"),
  hsl: document.getElementById("hsl"),
  hint: document.getElementById("hint"),
  native: document.getElementById("native"),
  recentWrap: document.getElementById("recentWrap"),
  recent: document.getElementById("recent"),
  clearRecent: document.getElementById("clearRecent"),
  status: document.getElementById("status"),
};

// The three copy rows -> which formatted string they yield from the current pick.
const FORMATS = { copyHex: "hex", copyRgb: "rgb", copyHsl: "hsl" };
let current = null; // { hex, rgb:"…", hsl:"…" }
let statusTimer = null;

function flash(msg) {
  els.status.textContent = msg;
  els.status.classList.remove("hidden");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => els.status.classList.add("hidden"), 1600);
}

// Render a hex into the swatch + value rows. Returns false for invalid input.
function show(hexInput) {
  const hex = normalizeHex(hexInput);
  if (!hex) return false;
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  current = { hex: fmtHex(hex), rgb: formatRgb(rgb), hsl: formatHsl(hsl) };

  els.swatch.style.background = hex;
  els.swatch.style.color = contrastText(rgb);
  els.swatch.textContent = current.hex;
  els.hex.textContent = current.hex;
  els.rgb.textContent = current.rgb;
  els.hsl.textContent = current.hsl;

  els.result.classList.remove("hidden");
  els.hint.classList.add("hidden");
  els.native.value = hex;
  return true;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    flash(t("copied"));
  } catch (e) {
    flash(t("errPick", String(e?.message || e)));
  }
}

// --- recent picks (storage.local: { recent: ["#rrggbb", …] }) ---

async function loadRecent() {
  const { recent = [], hexUpper: hu = true } = await chrome.storage.local.get({
    recent: [],
    hexUpper: true,
  });
  hexUpper = hu;
  renderRecent(recent);
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

  if ("EyeDropper" in window) {
    els.pick.addEventListener("click", pick);
  } else {
    els.pick.disabled = true;
    els.noEd.classList.remove("hidden");
  }

  els.native.addEventListener("input", () => show(els.native.value)); // live preview
  els.native.addEventListener("change", () => record(els.native.value)); // commit to recent

  document
    .getElementById("settings")
    .addEventListener("click", () => chrome.runtime.openOptionsPage());

  for (const [id, key] of Object.entries(FORMATS)) {
    document.getElementById(id).addEventListener("click", () => {
      if (current) copy(current[key]);
    });
  }

  els.clearRecent.addEventListener("click", async () => {
    await chrome.storage.local.set({ recent: [] });
    renderRecent([]);
  });

  loadRecent();
}

init();
