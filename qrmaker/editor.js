import { ellipsize, downloadFilename, clamp, degToRad } from "./lib.js";
import { addLogo, getLogos, deleteLogo, addHistory, getHistoryItem } from "./idb.js";

const PREVIEW_SIZE = 256;
const EC_LEVEL = "H"; // always high — codes (almost) always carry a center logo
const DEFAULTS = {
  dotStyle: "square",
  cornerStyle: "square",
  colorDots: "#000000",
  colorCorners: "#000000",
  colorBg: "#ffffff",
  gradientOn: false,
  gradColor1: "#1e88e5",
  gradColor2: "#ffffff",
  gradType: "linear",
  gradRotation: 0,
  margin: 10,
  size: 512,
  logoSize: 40,
};
const LOGO_MAX_PX = 256; // uploads are downscaled to this before storing

const $ = (id) => document.getElementById(id);

const els = {
  mount: $("qrMount"),
  empty: $("empty"),
  content: $("content"),
  dotStyle: $("dotStyle"),
  cornerStyle: $("cornerStyle"),
  colorDots: $("colorDots"),
  colorCorners: $("colorCorners"),
  colorBg: $("colorBg"),
  bgColorWrap: $("bgColorWrap"),
  gradientOn: $("gradientOn"),
  gradientFields: $("gradientFields"),
  gradColor1: $("gradColor1"),
  gradColor2: $("gradColor2"),
  gradType: $("gradType"),
  gradRotation: $("gradRotation"),
  gradRotationLabel: $("gradRotationLabel"),
  margin: $("margin"),
  marginLabel: $("marginLabel"),
  size: $("size"),
  sizeLabel: $("sizeLabel"),
  logoLibrary: $("logoLibrary"),
  logoNone: $("logoNone"),
  logoUpload: $("logoUpload"),
  logoFile: $("logoFile"),
  logoSize: $("logoSize"),
  logoSizeLabel: $("logoSizeLabel"),
  presetSelect: $("presetSelect"),
  presetStatus: $("presetStatus"),
  presetNew: $("presetNew"),
  presetSave: $("presetSave"),
  presetDelete: $("presetDelete"),
  presetDefault: $("presetDefault"),
  presetModal: $("presetModal"),
  presetName: $("presetName"),
  presetCancel: $("presetCancel"),
  presetConfirm: $("presetConfirm"),
  presetDeleteModal: $("presetDeleteModal"),
  presetDeleteName: $("presetDeleteName"),
  presetDeleteCancel: $("presetDeleteCancel"),
  presetDeleteConfirm: $("presetDeleteConfirm"),
  copy: $("copy"),
  reset: $("reset"),
  status: $("status"),
  history: $("history"),
  themeToggle: $("theme-toggle"),
  moon: $("moon-icon"),
  sun: $("sun-icon"),
  winClose: $("winClose"),
};

let qr = null;
let statusTimer = null;
let presetStatusTimer = null;
let activeLogo = null; // dataURL of the selected center logo, or null for none
let activeLogoId = null;
let presets = []; // [{ id, name, config }]
let defaultPresetId = null;

// --- theme ---

const osThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  els.moon.classList.toggle("hidden", isDark);
  els.sun.classList.toggle("hidden", !isDark);
  document.body.classList.remove("invisible");
}

async function loadTheme() {
  const { theme } = await chrome.storage.local.get({ theme: null });
  applyTheme(theme === "dark" || (theme == null && osThemeMedia.matches));
}

osThemeMedia.addEventListener("change", async (e) => {
  const { theme } = await chrome.storage.local.get({ theme: null });
  if (theme == null) applyTheme(e.matches);
});

els.themeToggle.addEventListener("click", async () => {
  const isDark = !document.documentElement.classList.contains("dark");
  applyTheme(isDark);
  await chrome.storage.local.set({ theme: isDark ? "dark" : "light" });
});

// --- status ---

function flash(message, ok = true) {
  els.status.textContent = message;
  els.status.classList.toggle("text-red-500", !ok);
  els.status.classList.toggle("dark:text-red-400", !ok);
  clearTimeout(statusTimer);
  if (ok && message) statusTimer = setTimeout(() => (els.status.textContent = ""), 2000);
}

// Inline confirmation in the Presets card header (blue for ok, red for error).
function presetFlash(message, ok = true) {
  els.presetStatus.textContent = message;
  els.presetStatus.classList.toggle("text-blue-600", ok);
  els.presetStatus.classList.toggle("dark:text-blue-400", ok);
  els.presetStatus.classList.toggle("text-red-500", !ok);
  els.presetStatus.classList.toggle("dark:text-red-400", !ok);
  clearTimeout(presetStatusTimer);
  if (message) presetStatusTimer = setTimeout(() => (els.presetStatus.textContent = ""), 2500);
}

// --- chip groups ---

function activeChip(group) {
  return group.querySelector(".chip.is-active")?.dataset.value;
}

function wireChips(group, onChange) {
  group.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip || !group.contains(chip)) return;
    for (const c of group.querySelectorAll(".chip")) c.classList.toggle("is-active", c === chip);
    onChange();
  });
}

// --- QR options ---

function background() {
  // gradient: null is required so toggling off clears a previously-merged gradient.
  if (!els.gradientOn.checked) return { color: els.colorBg.value, gradient: null };
  return {
    gradient: {
      type: els.gradType.value,
      rotation: degToRad(els.gradRotation.value),
      colorStops: [
        { offset: 0, color: els.gradColor1.value },
        { offset: 1, color: els.gradColor2.value },
      ],
    },
  };
}

function qrOptions(size = PREVIEW_SIZE) {
  return {
    width: size,
    height: size,
    type: "canvas",
    data: els.content.value,
    margin: clamp(els.margin.value, 0, 40),
    qrOptions: { errorCorrectionLevel: EC_LEVEL },
    dotsOptions: { color: els.colorDots.value, type: activeChip(els.dotStyle) },
    cornersSquareOptions: { color: els.colorCorners.value, type: activeChip(els.cornerStyle) },
    cornersDotOptions: { color: els.colorCorners.value },
    backgroundOptions: background(),
    image: activeLogo || "",
    imageOptions: {
      imageSize: clamp(els.logoSize.value, 10, 50) / 100,
      margin: 4,
      hideBackgroundDots: true,
    },
  };
}

// --- center logo ---

// Read an uploaded file and downscale it to a square-bounded PNG dataURL.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function markActiveTiles() {
  els.logoNone.classList.toggle("is-active", activeLogo === null);
  for (const tile of els.logoLibrary.querySelectorAll("[data-logo-id]")) {
    tile.classList.toggle("is-active", Number(tile.dataset.logoId) === activeLogoId);
  }
}

function selectLogo(dataUrl, id) {
  activeLogo = dataUrl;
  activeLogoId = id ?? null;
  markActiveTiles();
  render();
}

async function renderLibrary() {
  const logos = await getLogos();
  // drop previously-rendered logo tiles, keep the None + Upload buttons
  for (const w of els.logoLibrary.querySelectorAll(".logo-wrap")) w.remove();
  for (const { id, dataUrl } of logos) {
    const wrap = document.createElement("div");
    wrap.className = "logo-wrap relative";

    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "logo-tile";
    tile.dataset.logoId = String(id);
    tile.title = "Use this logo";
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "";
    img.className = "max-h-full max-w-full object-contain";
    tile.appendChild(img);
    tile.addEventListener("click", () => selectLogo(dataUrl, id));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "logo-del";
    del.textContent = "✕";
    del.title = "Remove from library";
    del.setAttribute("aria-label", "Remove logo from library");
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteLogo(id);
      if (activeLogoId === id) selectLogo(null, null);
      await renderLibrary();
    });

    wrap.append(tile, del);
    els.logoLibrary.appendChild(wrap);
  }
  markActiveTiles();
}

// --- presets ---

// The full editor state, minus the content (which comes from the active tab /
// query string). The logo is stored by its IndexedDB id, not the image bytes.
function captureConfig() {
  return {
    dotStyle: activeChip(els.dotStyle),
    cornerStyle: activeChip(els.cornerStyle),
    colorDots: els.colorDots.value,
    colorCorners: els.colorCorners.value,
    colorBg: els.colorBg.value,
    gradientOn: els.gradientOn.checked,
    gradColor1: els.gradColor1.value,
    gradColor2: els.gradColor2.value,
    gradType: els.gradType.value,
    gradRotation: Number(els.gradRotation.value) || 0,
    margin: clamp(els.margin.value, 0, 40),
    ecLevel: EC_LEVEL,
    size: clamp(els.size.value, 100, 1000),
    logoSize: clamp(els.logoSize.value, 10, 50),
    logoId: activeLogoId,
  };
}

async function applyConfig(cfg) {
  if (!cfg) return;
  setActive(els.dotStyle, cfg.dotStyle || DEFAULTS.dotStyle);
  setActive(els.cornerStyle, cfg.cornerStyle || DEFAULTS.cornerStyle);
  els.colorDots.value = cfg.colorDots ?? DEFAULTS.colorDots;
  els.colorCorners.value = cfg.colorCorners ?? DEFAULTS.colorCorners;
  els.colorBg.value = cfg.colorBg ?? DEFAULTS.colorBg;
  els.gradientOn.checked = !!cfg.gradientOn;
  els.gradColor1.value = cfg.gradColor1 ?? DEFAULTS.gradColor1;
  els.gradColor2.value = cfg.gradColor2 ?? DEFAULTS.gradColor2;
  els.gradType.value = cfg.gradType ?? DEFAULTS.gradType;
  els.gradRotation.value = cfg.gradRotation ?? DEFAULTS.gradRotation;
  els.margin.value = cfg.margin ?? DEFAULTS.margin;
  els.size.value = cfg.size ?? DEFAULTS.size;
  els.logoSize.value = cfg.logoSize ?? DEFAULTS.logoSize;
  // resolve the logo by id; it may have been deleted from the library
  if (cfg.logoId != null) {
    const found = (await getLogos()).find((l) => l.id === cfg.logoId);
    activeLogo = found ? found.dataUrl : null;
    activeLogoId = found ? found.id : null;
  } else {
    activeLogo = null;
    activeLogoId = null;
  }
  markActiveTiles();
  render();
}

async function loadPresets() {
  const stored = await chrome.storage.local.get({ presets: [], defaultPresetId: null });
  presets = Array.isArray(stored.presets) ? stored.presets : [];
  defaultPresetId = stored.defaultPresetId;
}

async function persistPresets() {
  await chrome.storage.local.set({ presets, defaultPresetId });
}

function selectedPresetId() {
  return els.presetSelect.value ? Number(els.presetSelect.value) : null;
}

function syncPresetControls() {
  const id = selectedPresetId();
  els.presetSave.disabled = id == null; // Save overwrites the selected preset
  els.presetDelete.disabled = id == null;
  els.presetDefault.disabled = id == null;
  els.presetDefault.checked = id != null && id === defaultPresetId;
}

function renderPresetOptions(selectedId = "") {
  els.presetSelect.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "— No preset —";
  els.presetSelect.appendChild(none);
  for (const p of presets) {
    const opt = document.createElement("option");
    opt.value = String(p.id);
    opt.textContent = p.id === defaultPresetId ? `★ ${p.name}` : p.name;
    els.presetSelect.appendChild(opt);
  }
  els.presetSelect.value = selectedId == null ? "" : String(selectedId);
  syncPresetControls();
}

async function onPresetChange() {
  syncPresetControls();
  const id = selectedPresetId();
  if (id == null) return;
  const p = presets.find((x) => x.id === id);
  if (p) await applyConfig(p.config);
}

async function savePreset(name) {
  const id = Date.now();
  presets.push({ id, name, config: captureConfig() });
  await persistPresets();
  renderPresetOptions(id);
}

// Overwrite the currently-selected preset's config with the current options.
async function updateSelectedPreset() {
  const id = selectedPresetId();
  const p = id == null ? null : presets.find((x) => x.id === id);
  if (!p) return;
  p.config = captureConfig();
  await persistPresets();
  presetFlash(`Saved “${p.name}”.`);
}

async function deleteSelectedPreset() {
  const id = selectedPresetId();
  if (id == null) return;
  const name = presets.find((p) => p.id === id)?.name ?? "preset";
  presets = presets.filter((p) => p.id !== id);
  if (defaultPresetId === id) defaultPresetId = null;
  await persistPresets();
  renderPresetOptions("");
  presetFlash(`Deleted “${name}”.`);
}

function openDeleteModal() {
  const id = selectedPresetId();
  if (id == null) return;
  els.presetDeleteName.textContent = presets.find((p) => p.id === id)?.name ?? "preset";
  els.presetDeleteModal.hidden = false;
  els.presetDeleteCancel.focus(); // safer default for a destructive action
}

function closeDeleteModal() {
  els.presetDeleteModal.hidden = true;
}

async function confirmDelete() {
  await deleteSelectedPreset();
  closeDeleteModal();
}

async function toggleDefault() {
  const id = selectedPresetId();
  if (id == null) return;
  defaultPresetId = els.presetDefault.checked ? id : null;
  await persistPresets();
  renderPresetOptions(id); // refresh the ★ markers
  presetFlash(els.presetDefault.checked ? "Set as default." : "Default cleared.");
}

function openPresetModal() {
  els.presetName.value = "";
  els.presetModal.hidden = false;
  els.presetName.focus();
}

function closePresetModal() {
  els.presetModal.hidden = true;
}

async function confirmPreset() {
  const name = els.presetName.value.trim();
  if (!name) {
    els.presetName.focus();
    return;
  }
  await savePreset(name);
  closePresetModal();
  presetFlash(`Created “${name}”.`);
}

// --- render ---

function render() {
  // reflect dependent UI
  els.gradientFields.hidden = !els.gradientOn.checked;
  els.bgColorWrap.classList.toggle("opacity-40", els.gradientOn.checked);
  els.marginLabel.textContent = clamp(els.margin.value, 0, 40) + "px";
  els.sizeLabel.textContent = clamp(els.size.value, 100, 1000) + "px";
  els.logoSizeLabel.textContent = clamp(els.logoSize.value, 10, 50) + "%";
  els.gradRotationLabel.textContent = (Number(els.gradRotation.value) || 0) + "°";

  const hasData = els.content.value.trim().length > 0;
  els.empty.hidden = hasData;
  els.mount.classList.toggle("hidden", !hasData);
  if (!hasData) {
    qr = null;
    els.mount.replaceChildren();
    return;
  }

  const opts = qrOptions();
  if (qr) {
    qr.update(opts);
  } else {
    qr = new QRCodeStyling(opts);
    els.mount.replaceChildren();
    qr.append(els.mount);
  }
  document.title = "QRmaker — " + ellipsize(els.content.value.trim(), 40);
}

// --- export ---

// Log a created code to the history (best-effort; never block the download).
async function recordHistory() {
  const content = els.content.value.trim();
  if (!content) return;
  try {
    await addHistory({ content, source: null, config: captureConfig() });
  } catch {
    /* history is non-critical */
  }
}

async function exporter(format) {
  const size = clamp(els.size.value, 100, 1000);
  const inst = new QRCodeStyling(qrOptions(size));
  return inst.getRawData(format);
}

async function download(format) {
  if (!qr) return;
  try {
    const blob = await exporter(format);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = downloadFilename(els.content.value.trim(), format);
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    recordHistory();
  } catch (e) {
    flash("Download failed: " + (e?.message || e), false);
  }
}

async function copyImage() {
  if (!qr) return;
  try {
    const blob = await exporter("png");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    flash("Copied to clipboard.");
    recordHistory();
  } catch (e) {
    flash("Copy failed: " + (e?.message || e), false);
  }
}

function reset() {
  setActive(els.dotStyle, DEFAULTS.dotStyle);
  setActive(els.cornerStyle, DEFAULTS.cornerStyle);
  els.colorDots.value = DEFAULTS.colorDots;
  els.colorCorners.value = DEFAULTS.colorCorners;
  els.colorBg.value = DEFAULTS.colorBg;
  els.gradientOn.checked = DEFAULTS.gradientOn;
  els.gradColor1.value = DEFAULTS.gradColor1;
  els.gradColor2.value = DEFAULTS.gradColor2;
  els.gradType.value = DEFAULTS.gradType;
  els.gradRotation.value = DEFAULTS.gradRotation;
  els.margin.value = DEFAULTS.margin;
  els.size.value = DEFAULTS.size;
  els.logoSize.value = DEFAULTS.logoSize;
  activeLogo = null; // clear the selection, but keep the saved library
  activeLogoId = null;
  markActiveTiles();
  renderPresetOptions(""); // deselect any preset — back to "— No preset —"
  render();
  flash("Reset to defaults.");
}

function setActive(group, value) {
  for (const c of group.querySelectorAll(".chip")) c.classList.toggle("is-active", c.dataset.value === value);
}

// --- wiring ---

wireChips(els.dotStyle, render);
wireChips(els.cornerStyle, render);

els.content.addEventListener("input", render);
for (const el of [
  els.colorDots,
  els.colorCorners,
  els.colorBg,
  els.gradientOn,
  els.gradColor1,
  els.gradColor2,
  els.gradType,
  els.gradRotation,
  els.margin,
  els.size,
]) {
  el.addEventListener("input", render);
}

document.getElementById("dlPng").addEventListener("click", () => download("png"));
document.getElementById("dlSvg").addEventListener("click", () => download("svg"));
document.getElementById("dlJpg").addEventListener("click", () => download("jpeg"));
els.copy.addEventListener("click", copyImage);
els.reset.addEventListener("click", reset);
els.history.addEventListener("click", () =>
  chrome.tabs.create({ url: chrome.runtime.getURL("history.html") }),
);

// Footer Close: shut the editor tab (window.close() is unreliable for a tab
// opened via chrome.tabs.create, so remove it by id, falling back if needed).
els.winClose.addEventListener("click", async () => {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch {
    /* fall back to window.close() below */
  }
  window.close();
});

els.logoNone.addEventListener("click", () => selectLogo(null, null));
els.logoUpload.addEventListener("click", () => els.logoFile.click());
els.logoSize.addEventListener("input", render);
els.logoFile.addEventListener("change", async () => {
  const file = els.logoFile.files?.[0];
  els.logoFile.value = ""; // allow re-selecting the same file later
  if (!file) return;
  try {
    const dataUrl = await fileToDataUrl(file);
    const id = await addLogo(dataUrl);
    await renderLibrary();
    selectLogo(dataUrl, id);
  } catch (e) {
    flash("Couldn't add that logo: " + (e?.message || e), false);
  }
});

els.presetSelect.addEventListener("change", onPresetChange);
els.presetNew.addEventListener("click", openPresetModal);
els.presetSave.addEventListener("click", updateSelectedPreset);
els.presetDelete.addEventListener("click", openDeleteModal);
els.presetDeleteCancel.addEventListener("click", closeDeleteModal);
els.presetDeleteConfirm.addEventListener("click", confirmDelete);
els.presetDeleteModal.addEventListener("click", (e) => {
  if (e.target === els.presetDeleteModal) closeDeleteModal();
});
els.presetDefault.addEventListener("change", toggleDefault);
els.presetCancel.addEventListener("click", closePresetModal);
els.presetConfirm.addEventListener("click", confirmPreset);
els.presetName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmPreset();
  }
});
els.presetModal.addEventListener("click", (e) => {
  if (e.target === els.presetModal) closePresetModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!els.presetModal.hidden) closePresetModal();
  if (!els.presetDeleteModal.hidden) closeDeleteModal();
});

async function init() {
  try {
    await renderLibrary();
  } catch (e) {
    flash("Couldn't load saved logos: " + (e?.message || e), false);
  }
  try {
    await loadPresets();
    renderPresetOptions(defaultPresetId ?? "");
    const def = defaultPresetId != null ? presets.find((p) => p.id === defaultPresetId) : null;
    if (def) await applyConfig(def.config);
  } catch (e) {
    flash("Couldn't load presets: " + (e?.message || e), false);
  }
  const params = new URLSearchParams(location.search);
  const histId = params.get("history");
  if (histId != null) {
    // re-opened from the history page: restore its content + style
    try {
      const item = await getHistoryItem(Number(histId));
      if (item) {
        await applyConfig(item.config);
        els.content.value = item.content;
      }
    } catch (e) {
      flash("Couldn't load that code: " + (e?.message || e), false);
    }
  } else {
    const data = params.get("data");
    if (data) els.content.value = data;
  }
  render();
}

loadTheme();
init();
