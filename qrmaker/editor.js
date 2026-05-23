import { ellipsize, downloadFilename, clamp, degToRad } from "./lib.js";
import { addLogo, getLogos, deleteLogo } from "./idb.js";

const PREVIEW_SIZE = 256;
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
  ecLevel: "M",
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
  ecLevel: $("ecLevel"),
  size: $("size"),
  sizeLabel: $("sizeLabel"),
  logoLibrary: $("logoLibrary"),
  logoNone: $("logoNone"),
  logoUpload: $("logoUpload"),
  logoFile: $("logoFile"),
  logoSize: $("logoSize"),
  logoSizeLabel: $("logoSizeLabel"),
  copy: $("copy"),
  reset: $("reset"),
  status: $("status"),
  themeToggle: $("theme-toggle"),
  moon: $("moon-icon"),
  sun: $("sun-icon"),
};

let qr = null;
let statusTimer = null;
let activeLogo = null; // dataURL of the selected center logo, or null for none
let activeLogoId = null;

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
    qrOptions: { errorCorrectionLevel: els.ecLevel.value },
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
  if (dataUrl) els.ecLevel.value = "H"; // a logo covers modules — H tolerates it
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
  els.ecLevel.value = DEFAULTS.ecLevel;
  els.size.value = DEFAULTS.size;
  els.logoSize.value = DEFAULTS.logoSize;
  activeLogo = null; // clear the selection, but keep the saved library
  activeLogoId = null;
  markActiveTiles();
  render();
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
  els.ecLevel,
  els.size,
]) {
  el.addEventListener("input", render);
}

document.getElementById("dlPng").addEventListener("click", () => download("png"));
document.getElementById("dlSvg").addEventListener("click", () => download("svg"));
document.getElementById("dlJpg").addEventListener("click", () => download("jpeg"));
els.copy.addEventListener("click", copyImage);
els.reset.addEventListener("click", reset);

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

async function init() {
  const data = new URLSearchParams(location.search).get("data");
  if (data) els.content.value = data;
  try {
    await renderLibrary();
  } catch (e) {
    flash("Couldn't load saved logos: " + (e?.message || e), false);
  }
  render();
}

loadTheme();
init();
