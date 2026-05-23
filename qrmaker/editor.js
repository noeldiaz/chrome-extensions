import { ellipsize, downloadFilename, clamp, degToRad } from "./lib.js";

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
};

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
  copy: $("copy"),
  reset: $("reset"),
  status: $("status"),
  themeToggle: $("theme-toggle"),
  moon: $("moon-icon"),
  sun: $("sun-icon"),
};

let qr = null;
let statusTimer = null;

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
  };
}

// --- render ---

function render() {
  // reflect dependent UI
  els.gradientFields.hidden = !els.gradientOn.checked;
  els.bgColorWrap.classList.toggle("opacity-40", els.gradientOn.checked);
  els.marginLabel.textContent = clamp(els.margin.value, 0, 40) + "px";
  els.sizeLabel.textContent = clamp(els.size.value, 100, 1000) + "px";
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

function init() {
  const data = new URLSearchParams(location.search).get("data");
  if (data) els.content.value = data;
  render();
}

loadTheme();
init();
