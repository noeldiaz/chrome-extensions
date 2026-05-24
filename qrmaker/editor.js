import {
  ellipsize,
  downloadFilename,
  clamp,
  degToRad,
  cardLayout,
  buildWifi,
  buildVCard,
  buildEmail,
  buildSms,
  buildTel,
  buildGeo,
} from "./lib.js";
import {
  addLogo,
  getLogos,
  deleteLogo,
  addHistory,
  getHistoryItem,
  updateHistoryItem,
} from "./idb.js";
import { initTheme } from "./theme.js";

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
  cardOn: false,
  cardText: "",
  cardTextColor: "#ffffff",
  cardBg: "#0e7490",
  cardGradOn: true,
  cardGradColor1: "#155e75",
  cardGradColor2: "#0891b2",
  cardGradType: "linear",
  cardGradRotation: 135,
};
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const LOGO_MAX_PX = 256; // uploads are downscaled to this before storing

const $ = (id) => document.getElementById(id);

const els = {
  mount: $("qrMount"),
  empty: $("empty"),
  content: $("content"),
  qrType: $("qrType"),
  // wi-fi
  wifiSsid: $("wifiSsid"),
  wifiPass: $("wifiPass"),
  wifiEnc: $("wifiEnc"),
  wifiHidden: $("wifiHidden"),
  // contact / vcard
  vcFirst: $("vcFirst"),
  vcLast: $("vcLast"),
  vcPhone: $("vcPhone"),
  vcEmail: $("vcEmail"),
  vcOrg: $("vcOrg"),
  vcTitle: $("vcTitle"),
  vcUrl: $("vcUrl"),
  vcStreet: $("vcStreet"),
  vcCity: $("vcCity"),
  vcRegion: $("vcRegion"),
  vcZip: $("vcZip"),
  vcCountry: $("vcCountry"),
  vcNote: $("vcNote"),
  // email
  emailTo: $("emailTo"),
  emailSubject: $("emailSubject"),
  emailBody: $("emailBody"),
  // sms
  smsNumber: $("smsNumber"),
  smsMessage: $("smsMessage"),
  // phone
  telNumber: $("telNumber"),
  // location
  geoLat: $("geoLat"),
  geoLng: $("geoLng"),
  geoLocate: $("geoLocate"),
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
  cardOn: $("cardOn"),
  cardFields: $("cardFields"),
  cardText: $("cardText"),
  cardTextColor: $("cardTextColor"),
  cardBg: $("cardBg"),
  cardBgWrap: $("cardBgWrap"),
  cardGradOn: $("cardGradOn"),
  cardGradFields: $("cardGradFields"),
  cardGradColor1: $("cardGradColor1"),
  cardGradColor2: $("cardGradColor2"),
  cardGradType: $("cardGradType"),
  cardGradRotation: $("cardGradRotation"),
  cardGradRotationLabel: $("cardGradRotationLabel"),
  previewCard: $("previewCard"),
  previewCaption: $("previewCaption"),
  previewTile: $("previewTile"),
  dlSvg: $("dlSvg"),
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
// The history record this editor session is bound to, so re-exports update that
// one row instead of piling up new entries. Set when opened via ?history, or on
// the first download/copy of a fresh session.
let historyId = null;
let historySource = null;

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
    for (const c of group.querySelectorAll(".chip")) {
      const on = c === chip;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", String(on));
    }
    onChange();
  });
}

// --- structured types ---

// Snapshot of the active type's form fields. Also persisted to history so a
// re-opened code can rebuild its form. Returns null for plain text / URL.
function structuredFields() {
  switch (els.qrType.value) {
    case "wifi":
      return {
        ssid: els.wifiSsid.value,
        password: els.wifiPass.value,
        encryption: els.wifiEnc.value,
        hidden: els.wifiHidden.checked,
      };
    case "vcard":
      return {
        firstName: els.vcFirst.value,
        lastName: els.vcLast.value,
        phone: els.vcPhone.value,
        email: els.vcEmail.value,
        org: els.vcOrg.value,
        title: els.vcTitle.value,
        url: els.vcUrl.value,
        street: els.vcStreet.value,
        city: els.vcCity.value,
        region: els.vcRegion.value,
        zip: els.vcZip.value,
        country: els.vcCountry.value,
        note: els.vcNote.value,
      };
    case "email":
      return { to: els.emailTo.value, subject: els.emailSubject.value, body: els.emailBody.value };
    case "sms":
      return { number: els.smsNumber.value, message: els.smsMessage.value };
    case "tel":
      return { number: els.telNumber.value };
    case "geo":
      return { lat: els.geoLat.value, lng: els.geoLng.value };
    default:
      return null;
  }
}

// The encoded payload for the active type. Text / URL uses the textarea as-is;
// structured types compose their scheme string from the form fields.
function payload() {
  switch (els.qrType.value) {
    case "wifi":
      return buildWifi(structuredFields());
    case "vcard":
      return buildVCard(structuredFields());
    case "email":
      return buildEmail(structuredFields());
    case "sms":
      return buildSms(structuredFields());
    case "tel":
      return buildTel(structuredFields());
    case "geo":
      return buildGeo(structuredFields());
    default:
      return els.content.value;
  }
}

// Show only the field group matching the active type.
function showTypeFields() {
  for (const g of document.querySelectorAll(".qr-fields")) {
    g.hidden = g.dataset.type !== els.qrType.value;
  }
}

// Rebuild a structured form from a stored snapshot (history re-open).
function applyStructured(kind, f) {
  els.qrType.value = kind;
  if (kind === "wifi") {
    els.wifiSsid.value = f.ssid || "";
    els.wifiPass.value = f.password || "";
    els.wifiEnc.value = f.encryption || "WPA";
    els.wifiHidden.checked = !!f.hidden;
  } else if (kind === "vcard") {
    els.vcFirst.value = f.firstName || "";
    els.vcLast.value = f.lastName || "";
    els.vcPhone.value = f.phone || "";
    els.vcEmail.value = f.email || "";
    els.vcOrg.value = f.org || "";
    els.vcTitle.value = f.title || "";
    els.vcUrl.value = f.url || "";
    els.vcStreet.value = f.street || "";
    els.vcCity.value = f.city || "";
    els.vcRegion.value = f.region || "";
    els.vcZip.value = f.zip || "";
    els.vcCountry.value = f.country || "";
    els.vcNote.value = f.note || "";
  } else if (kind === "email") {
    els.emailTo.value = f.to || "";
    els.emailSubject.value = f.subject || "";
    els.emailBody.value = f.body || "";
  } else if (kind === "sms") {
    els.smsNumber.value = f.number || "";
    els.smsMessage.value = f.message || "";
  } else if (kind === "tel") {
    els.telNumber.value = f.number || "";
  } else if (kind === "geo") {
    els.geoLat.value = f.lat || "";
    els.geoLng.value = f.lng || "";
  }
}

// --- QR options ---

function background() {
  // Inside a card the code sits on a white quiet-zone tile, so its own
  // background (colour/gradient) is dropped — keeps the tile clean and the code
  // scannable instead of stacking a second background behind it.
  if (els.cardOn.checked) return { color: "#ffffff", gradient: null };
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
    data: payload(),
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
  const noneOn = activeLogo === null;
  els.logoNone.classList.toggle("is-active", noneOn);
  els.logoNone.setAttribute("aria-pressed", String(noneOn));
  for (const tile of els.logoLibrary.querySelectorAll("[data-logo-id]")) {
    const on = Number(tile.dataset.logoId) === activeLogoId;
    tile.classList.toggle("is-active", on);
    tile.setAttribute("aria-pressed", String(on));
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
    cardOn: els.cardOn.checked,
    cardText: els.cardText.value,
    cardTextColor: els.cardTextColor.value,
    cardBg: els.cardBg.value,
    cardGradOn: els.cardGradOn.checked,
    cardGradColor1: els.cardGradColor1.value,
    cardGradColor2: els.cardGradColor2.value,
    cardGradType: els.cardGradType.value,
    cardGradRotation: Number(els.cardGradRotation.value) || 0,
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
  els.cardOn.checked = !!cfg.cardOn;
  els.cardText.value = cfg.cardText ?? DEFAULTS.cardText;
  els.cardTextColor.value = cfg.cardTextColor ?? DEFAULTS.cardTextColor;
  els.cardBg.value = cfg.cardBg ?? DEFAULTS.cardBg;
  els.cardGradOn.checked = cfg.cardGradOn ?? DEFAULTS.cardGradOn;
  els.cardGradColor1.value = cfg.cardGradColor1 ?? DEFAULTS.cardGradColor1;
  els.cardGradColor2.value = cfg.cardGradColor2 ?? DEFAULTS.cardGradColor2;
  els.cardGradType.value = cfg.cardGradType ?? DEFAULTS.cardGradType;
  els.cardGradRotation.value = cfg.cardGradRotation ?? DEFAULTS.cardGradRotation;
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

  // card / frame
  els.cardFields.hidden = !els.cardOn.checked;
  els.cardGradFields.hidden = !els.cardGradOn.checked;
  els.cardBgWrap.classList.toggle("opacity-40", els.cardGradOn.checked);
  els.cardGradRotationLabel.textContent = (Number(els.cardGradRotation.value) || 0) + "°";
  // a card is a raster composite — SVG can't carry it
  els.dlSvg.disabled = els.cardOn.checked;
  els.dlSvg.classList.toggle("cursor-not-allowed", els.cardOn.checked);
  els.dlSvg.classList.toggle("opacity-40", els.cardOn.checked);
  els.dlSvg.title = els.cardOn.checked ? "Turn off the card to export SVG (code-only)" : "";
  updateCardPreview();
  showTypeFields();

  const data = payload();
  const hasData = data.trim().length > 0;
  if (!hasData) {
    qr = null;
    els.mount.replaceChildren();
    els.mount.classList.add("hidden");
    els.empty.textContent =
      els.qrType.value === "text"
        ? "Enter content to generate a code."
        : "Fill in the fields to generate a code.";
    els.empty.hidden = false;
    return;
  }

  const opts = qrOptions();
  try {
    // qrcode-generator throws "code length overflow" synchronously when the
    // payload exceeds the symbol's capacity at this error-correction level.
    if (qr) {
      qr.update(opts);
    } else {
      qr = new QRCodeStyling(opts);
      els.mount.replaceChildren();
      qr.append(els.mount);
    }
  } catch {
    qr = null;
    els.mount.replaceChildren();
    els.mount.classList.add("hidden");
    els.empty.textContent = "Too long to encode — try shortening the text.";
    els.empty.hidden = false;
    return;
  }
  els.empty.hidden = true;
  els.mount.classList.remove("hidden");
  document.title = "QRmaker — " + ellipsize(data.trim(), 40);
}

// --- card / frame ---

// CSS background string for the live preview (solid or gradient). Mirrors the
// canvas gradient in makeCardGradient closely enough for a faithful preview.
function cardCssBackground() {
  const c1 = els.cardGradColor1.value;
  const c2 = els.cardGradColor2.value;
  if (!els.cardGradOn.checked) return els.cardBg.value;
  if (els.cardGradType.value === "radial") return `radial-gradient(circle at center, ${c1}, ${c2})`;
  return `linear-gradient(${Number(els.cardGradRotation.value) || 0}deg, ${c1}, ${c2})`;
}

// Style the preview panel as the export card when enabled; otherwise leave the
// plain white panel. Inline styles win over the panel's Tailwind bg classes and
// are cleared when the card is off.
function updateCardPreview() {
  if (!els.cardOn.checked) {
    els.previewCard.style.background = "";
    els.previewTile.style.background = "";
    els.previewTile.style.padding = "";
    els.previewTile.classList.remove("rounded-xl");
    els.previewCaption.hidden = true;
    return;
  }
  els.previewCard.style.background = cardCssBackground();
  els.previewTile.style.background = "#ffffff";
  els.previewTile.style.padding = "12px";
  els.previewTile.classList.add("rounded-xl");
  const text = els.cardText.value.trim();
  els.previewCaption.hidden = !text;
  els.previewCaption.textContent = text;
  els.previewCaption.style.color = els.cardTextColor.value;
  els.previewCaption.style.fontSize = Math.round(PREVIEW_SIZE * 0.082) + "px";
}

// Build a canvas gradient spanning the whole card.
function makeCardGradient(ctx, w, h) {
  const c1 = els.cardGradColor1.value;
  const c2 = els.cardGradColor2.value;
  let g;
  if (els.cardGradType.value === "radial") {
    g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  } else {
    const a = degToRad(els.cardGradRotation.value);
    const half = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * h) / 2;
    g = ctx.createLinearGradient(
      w / 2 - Math.cos(a) * half,
      h / 2 - Math.sin(a) * half,
      w / 2 + Math.cos(a) * half,
      h / 2 + Math.sin(a) * half,
    );
  }
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Greedy word-wrap to fit maxWidth (ctx must already have the caption font set).
// Honors explicit newlines in the caption.
function wrapCaption(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + " " + words[i];
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
  }
  return lines;
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not render the code image."));
    };
    img.src = url;
  });
}

// Composite the "Scan me" card to a raster Blob: gradient/solid background,
// wrapped caption on top, and the QR on a white rounded tile. Geometry comes
// from lib.cardLayout so it stays in sync with the unit tests.
async function renderCard(format) {
  const size = clamp(els.size.value, 100, 1000);
  const qrImg = await blobToImage(await new QRCodeStyling(qrOptions(size)).getRawData("png"));

  // measure caption against the tile width to know the line count, then lay out
  const tileW = size + Math.round(size * 0.06) * 2;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `600 ${Math.round(size * 0.082)}px ${FONT_STACK}`;
  const text = els.cardText.value.trim();
  const lines = text ? wrapCaption(probe, text, tileW) : [];
  const L = cardLayout(size, lines.length);

  const canvas = document.createElement("canvas");
  canvas.width = L.width;
  canvas.height = L.height;
  const ctx = canvas.getContext("2d");

  // JPEG has no alpha: fill white behind so the rounded corners aren't black
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, L.width, L.height);
  }

  // card background
  ctx.fillStyle = els.cardGradOn.checked ? makeCardGradient(ctx, L.width, L.height) : els.cardBg.value;
  roundRectPath(ctx, 0, 0, L.width, L.height, L.cardRadius);
  ctx.fill();

  // caption
  if (lines.length) {
    ctx.fillStyle = els.cardTextColor.value;
    ctx.font = `600 ${L.font}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    let y = L.pad + L.font;
    for (const line of lines) {
      if (line) ctx.fillText(line, L.width / 2, y);
      y += L.lineH;
    }
  }

  // white tile + QR
  const tileX = L.pad;
  const tileY = L.pad + L.captionH;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, tileX, tileY, L.tile, L.tile, L.tileRadius);
  ctx.fill();
  ctx.drawImage(qrImg, tileX + L.tilePad, tileY + L.tilePad, size, size);

  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export failed."))), mime, 0.92);
  });
}

// --- export ---

// Log a created code (best-effort; never block the download). Once a session is
// bound to a history record (opened from history, or after the first export),
// later exports update that same row rather than adding new ones.
async function recordHistory() {
  const content = payload().trim();
  if (!content) return;
  const config = captureConfig();
  const kind = els.qrType.value;
  const fields = structuredFields(); // null for plain text / URL
  try {
    if (historyId != null) {
      await updateHistoryItem(historyId, { content, source: historySource, config, kind, fields });
    } else {
      historyId = await addHistory({ content, source: historySource, config, kind, fields });
    }
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
  if (els.cardOn.checked && format === "svg") return; // card is raster-only; button is disabled
  try {
    const blob = els.cardOn.checked ? await renderCard(format) : await exporter(format);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = downloadFilename(payload().trim(), format);
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
    const blob = els.cardOn.checked ? await renderCard("png") : await exporter("png");
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
  els.cardOn.checked = DEFAULTS.cardOn;
  els.cardText.value = DEFAULTS.cardText;
  els.cardTextColor.value = DEFAULTS.cardTextColor;
  els.cardBg.value = DEFAULTS.cardBg;
  els.cardGradOn.checked = DEFAULTS.cardGradOn;
  els.cardGradColor1.value = DEFAULTS.cardGradColor1;
  els.cardGradColor2.value = DEFAULTS.cardGradColor2;
  els.cardGradType.value = DEFAULTS.cardGradType;
  els.cardGradRotation.value = DEFAULTS.cardGradRotation;
  activeLogo = null; // clear the selection, but keep the saved library
  activeLogoId = null;
  markActiveTiles();
  renderPresetOptions(""); // deselect any preset — back to "— No preset —"
  render();
  flash("Reset to defaults.");
}

function setActive(group, value) {
  for (const c of group.querySelectorAll(".chip")) {
    const on = c.dataset.value === value;
    c.classList.toggle("is-active", on);
    c.setAttribute("aria-pressed", String(on));
  }
}

// --- wiring ---

wireChips(els.dotStyle, render);
wireChips(els.cornerStyle, render);

els.content.addEventListener("input", render);
els.qrType.addEventListener("change", render);
for (const el of [
  els.wifiSsid,
  els.wifiPass,
  els.wifiEnc,
  els.wifiHidden,
  els.vcFirst,
  els.vcLast,
  els.vcPhone,
  els.vcEmail,
  els.vcOrg,
  els.vcTitle,
  els.vcUrl,
  els.vcStreet,
  els.vcCity,
  els.vcRegion,
  els.vcZip,
  els.vcCountry,
  els.vcNote,
  els.emailTo,
  els.emailSubject,
  els.emailBody,
  els.smsNumber,
  els.smsMessage,
  els.telNumber,
  els.geoLat,
  els.geoLng,
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
  els.cardOn,
  els.cardText,
  els.cardTextColor,
  els.cardBg,
  els.cardGradOn,
  els.cardGradColor1,
  els.cardGradColor2,
  els.cardGradType,
  els.cardGradRotation,
]) {
  el.addEventListener("input", render);
}

// Fill the Location fields from the device. Uses the browser's geolocation
// prompt on click (no install-time permission); coords stay local.
els.geoLocate.addEventListener("click", () => {
  if (!navigator.geolocation) {
    flash("Geolocation isn't available in this browser.", false);
    return;
  }
  els.geoLocate.disabled = true;
  flash("Getting your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      els.geoLocate.disabled = false;
      els.geoLat.value = pos.coords.latitude.toFixed(6);
      els.geoLng.value = pos.coords.longitude.toFixed(6);
      render();
      flash("Location filled in.");
    },
    (err) => {
      els.geoLocate.disabled = false;
      const msg =
        err.code === err.PERMISSION_DENIED
          ? "Location permission denied."
          : err.code === err.POSITION_UNAVAILABLE
            ? "Location unavailable."
            : err.code === err.TIMEOUT
              ? "Location request timed out."
              : "Couldn't get your location.";
      flash(msg, false);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
});

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
        historyId = item.id; // bind: edits update this record
        historySource = item.source ?? null;
        await applyConfig(item.config);
        if (item.kind && item.kind !== "text" && item.fields) {
          applyStructured(item.kind, item.fields); // rebuild the structured form
        } else {
          els.qrType.value = "text";
          els.content.value = item.content;
        }
      }
    } catch (e) {
      flash("Couldn't load that code: " + (e?.message || e), false);
    }
  } else {
    const data = params.get("data");
    if (data) els.content.value = data;
    // ?type= (from the popup's "More types" shortcut) preselects a structured type
    const type = params.get("type");
    if (type && ["text", "wifi", "vcard", "email", "sms", "tel", "geo"].includes(type)) {
      els.qrType.value = type;
    }
  }
  render();
}

initTheme({ toggle: els.themeToggle, moon: els.moon, sun: els.sun });
init();
