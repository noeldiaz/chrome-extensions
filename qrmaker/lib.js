// Pure helpers, unit-tested with node:test. No chrome/DOM access here.

// A QR code of a non-web URL (chrome://, the Web Store, a local file) can't be
// opened by scanning it on another device, so we only encode http(s).
export function isShareableUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Middle-truncate a long URL for display: keep the start (scheme + host) and the
// tail (often the meaningful slug) and drop the middle. Returns text unchanged
// when it already fits.
export function ellipsize(text, max = 72) {
  if (typeof text !== "string" || text.length <= max) return text || "";
  if (max <= 1) return "…";
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return text.slice(0, head) + "…" + text.slice(text.length - tail);
}

// Clamp n into [min, max]; non-numeric input falls back to min.
export function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function degToRad(deg) {
  return (Number(deg) || 0) * (Math.PI / 180);
}

// A match pattern covering one URL's origin, for an optional host-permission
// request (e.g. "https://example.com/*"). Returns null for non-http(s) URLs
// (data:/blob:/extension pages don't need a host permission).
export function originPattern(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

// Geometry for the exported "Scan me" card: a rounded frame holding a caption
// over the QR on a white rounded tile. All sizes derive from the QR module size
// S (px) so the look scales with the export size. `lines` is the number of
// wrapped caption lines (0 = no caption). Pure, so it's unit-tested without a
// canvas; the compositor in editor.js draws to exactly these coordinates.
export function cardLayout(size, lines = 0) {
  const S = clamp(size, 100, 1000);
  const pad = Math.round(S * 0.11); // outer card padding
  const tilePad = Math.round(S * 0.06); // white quiet-zone tile around the QR
  const tileRadius = Math.round(S * 0.05);
  const cardRadius = Math.round(S * 0.08);
  const font = Math.round(S * 0.082); // caption font size
  const lineH = Math.round(font * 1.25);
  const tile = S + tilePad * 2;
  const gap = lines > 0 ? Math.round(S * 0.05) : 0; // caption-to-tile gap
  const captionH = lines > 0 ? lines * lineH + gap : 0;
  const width = tile + pad * 2;
  const height = pad + captionH + tile + pad;
  return { S, pad, tilePad, tileRadius, cardRadius, font, lineH, tile, gap, captionH, width, height };
}

// --- structured QR payload builders ---
// Each turns a plain field object into the string a scanner recognizes for that
// type. Pure + unit-tested. Returns "" when the essential field is missing, so
// the editor naturally shows its empty state. Whitespace-only fields are dropped.

const trim = (v) => String(v ?? "").trim();

// Escape the Wi-Fi / MeCard reserved characters: \ ; , : "
const escapeWifi = (s) => String(s ?? "").replace(/([\\;,:"])/g, "\\$1");

// Wi-Fi network join: WIFI:T:WPA;S:ssid;P:password;H:true;;
export function buildWifi({ ssid = "", password = "", encryption = "WPA", hidden = false } = {}) {
  if (!trim(ssid)) return "";
  const enc = ["WPA", "WEP", "nopass"].includes(encryption) ? encryption : "WPA";
  const parts = [`T:${enc}`, `S:${escapeWifi(ssid)}`];
  if (enc !== "nopass" && password) parts.push(`P:${escapeWifi(password)}`);
  if (hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

// Escape vCard reserved characters: \ , ; and newlines.
const escapeVCard = (s) =>
  String(s ?? "")
    .replace(/([\\,;])/g, "\\$1")
    .replace(/\r?\n/g, "\\n");

// Contact card (vCard 3.0). Needs at least a name, org, phone, or email; the
// address (ADR) and note are optional add-ons.
export function buildVCard({
  firstName = "",
  lastName = "",
  phone = "",
  email = "",
  org = "",
  title = "",
  url = "",
  street = "",
  city = "",
  region = "",
  zip = "",
  country = "",
  note = "",
} = {}) {
  const fn = [firstName, lastName].map(trim).filter(Boolean).join(" ");
  if (!fn && !trim(org) && !trim(phone) && !trim(email)) return "";
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`N:${escapeVCard(lastName)};${escapeVCard(firstName)};;;`);
  lines.push(`FN:${escapeVCard(fn || org)}`);
  if (trim(org)) lines.push(`ORG:${escapeVCard(org)}`);
  if (trim(title)) lines.push(`TITLE:${escapeVCard(title)}`);
  if (trim(phone)) lines.push(`TEL:${escapeVCard(phone)}`);
  if (trim(email)) lines.push(`EMAIL:${escapeVCard(email)}`);
  // ADR components: po-box;extended;street;locality;region;postal-code;country
  // (the first two are conventionally left empty).
  if ([street, city, region, zip, country].some((v) => trim(v))) {
    lines.push(
      `ADR:;;${escapeVCard(street)};${escapeVCard(city)};${escapeVCard(region)};${escapeVCard(zip)};${escapeVCard(country)}`,
    );
  }
  if (trim(url)) lines.push(`URL:${escapeVCard(url)}`);
  if (trim(note)) lines.push(`NOTE:${escapeVCard(note)}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

// Email: mailto:addr?subject=..&body=.. (percent-encoded, so spaces are %20).
export function buildEmail({ to = "", subject = "", body = "" } = {}) {
  if (!trim(to)) return "";
  const params = [];
  if (trim(subject)) params.push("subject=" + encodeURIComponent(subject));
  if (trim(body)) params.push("body=" + encodeURIComponent(body));
  return `mailto:${trim(to)}${params.length ? "?" + params.join("&") : ""}`;
}

// SMS: SMSTO:number:message (the most broadly-supported SMS scheme).
export function buildSms({ number = "", message = "" } = {}) {
  if (!trim(number)) return "";
  return trim(message) ? `SMSTO:${trim(number)}:${message}` : `SMSTO:${trim(number)}`;
}

// Phone dial: tel:number
export function buildTel({ number = "" } = {}) {
  return trim(number) ? `tel:${trim(number)}` : "";
}

// Geo coordinate: geo:lat,lng (both must parse as finite numbers).
export function buildGeo({ lat = "", lng = "" } = {}) {
  const a = parseFloat(lat);
  const b = parseFloat(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  return `geo:${a},${b}`;
}

const pad2 = (n) => String(n).padStart(2, "0");

// Build a download filename like "qr-example.com-20260523-141500.png".
// Derives a safe slug from the URL's host (falls back to "code"), and maps the
// qr-code-styling format name to a sensible extension (jpeg -> jpg).
export function downloadFilename(value, format = "png", when = new Date()) {
  let host = "code";
  try {
    host = new URL(value).hostname || "code";
  } catch {
    /* not a URL — keep the fallback */
  }
  const slug = host.replace(/[^a-z0-9.-]+/gi, "").replace(/^-+|-+$/g, "") || "code";
  const stamp =
    `${when.getFullYear()}${pad2(when.getMonth() + 1)}${pad2(when.getDate())}` +
    `-${pad2(when.getHours())}${pad2(when.getMinutes())}${pad2(when.getSeconds())}`;
  const ext = format === "jpeg" ? "jpg" : format;
  return `qr-${slug}-${stamp}.${ext}`;
}
