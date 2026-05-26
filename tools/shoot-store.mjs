#!/usr/bin/env node
// Build Chrome Web Store assets from raw popup/options grabs.
//
//   node tools/shoot-store.mjs <ext>            # screenshots + marquee
//   node tools/shoot-store.mjs <ext> marquee    # marquee only
//
// Screenshots: reads <ext>/screenshots/*.png (raw window grabs), composites
// each onto a branded 1280x800 canvas with a headline (optional per-shot crop),
// writes <ext>/store/screenshots/.
// Marquee: 1400x560 promo banner from the icon + tagline -> <ext>/store/.
// Renders with headless Google Chrome — no extra npm deps.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Per-extension brand, per-shot headlines, optional per-shot crop {t,r,b,l}
// (pixels trimmed from each edge of the raw grab), and marquee copy.
const CONFIG = {
  refresher: {
    grad: ["#1e3a8a", "#2563eb", "#1d4ed8"],
    captions: {
      "01": "Auto-refresh any tab on your interval",
      "03": "Live countdown right in the toolbar badge",
      "04": "Looks sharp in dark mode",
      "02": "Sync across devices, backup & restore",
    },
    marquee: { title: "Refresher", tagline: "Auto-refresh any tab, on your schedule." },
  },
};

const ext = process.argv[2];
const mode = process.argv[3]; // "marquee" to skip screenshots
if (!ext) {
  console.error("usage: node tools/shoot-store.mjs <ext> [marquee]");
  process.exit(1);
}
const cfg = CONFIG[ext];
if (!cfg) {
  console.error(`no store config for "${ext}" — add one to CONFIG`);
  process.exit(1);
}

const [g0, g1, g2] = cfg.grad;
const outDir = join(ROOT, ext, "store", "screenshots");
const storeDir = join(ROOT, ext, "store");

// Read width/height from a PNG IHDR (bytes 16..23, big-endian).
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function render(html, out, w, h) {
  const tmp = `${out}.tmp.html`;
  writeFileSync(tmp, html);
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${w},${h}`,
      "--default-background-color=00000000",
      `--screenshot=${out}`,
      `file://${tmp}`,
    ],
    { stdio: "ignore" }
  );
  unlinkSync(tmp);
}

function screenshotPage(buf, caption, crop) {
  const { w: W, h: H } = pngSize(buf);
  const c = { t: 0, r: 0, b: 0, l: 0, ...(crop || {}) };
  const vw = W - c.l - c.r; // visible region after crop
  const vh = H - c.t - c.b;
  const scale = Math.min(560 / vh, 1080 / vw, 1.4); // fit, allow modest upscale
  const dispW = Math.round(vw * scale);
  const dispH = Math.round(vh * scale);
  const b64 = buf.toString("base64");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1280px; height: 800px; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 44px;
    font-family: -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
    background:
      radial-gradient(120% 90% at 50% -10%, ${g1}33 0%, transparent 55%),
      linear-gradient(150deg, ${g0} 0%, ${g1} 55%, ${g2} 100%);
    overflow: hidden;
  }
  h1 {
    color: #fff; font-size: 40px; font-weight: 700; letter-spacing: -0.02em;
    text-align: center; max-width: 1040px; line-height: 1.15;
    text-shadow: 0 2px 12px rgba(0,0,0,.28);
  }
  .frame {
    width: ${dispW}px; height: ${dispH}px; overflow: hidden;
    border-radius: 16px;
    box-shadow: 0 30px 70px -20px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.10);
  }
  .frame img {
    display: block; width: ${Math.round(W * scale)}px; height: ${Math.round(H * scale)}px;
    margin: -${Math.round(c.t * scale)}px 0 0 -${Math.round(c.l * scale)}px;
  }
  </style></head><body>
  ${caption ? `<h1>${caption}</h1>` : ""}
  <div class="frame"><img src="data:image/png;base64,${b64}"></div>
  </body></html>`;
}

function marqueePage() {
  const icon = readFileSync(join(ROOT, ext, "icons", "icon512.png")).toString("base64");
  const { title, tagline } = cfg.marquee;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1400px; height: 560px; }
  body {
    display: flex; align-items: center; justify-content: center; gap: 70px;
    font-family: -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
    background:
      radial-gradient(90% 120% at 18% 0%, ${g1}40 0%, transparent 55%),
      linear-gradient(150deg, ${g0} 0%, ${g1} 55%, ${g2} 100%);
    overflow: hidden;
  }
  .icon { width: 240px; height: 240px; filter: drop-shadow(0 24px 48px rgba(0,0,0,.45)); }
  .copy { max-width: 720px; }
  .copy h1 {
    color: #fff; font-size: 92px; font-weight: 800; letter-spacing: -0.03em; line-height: 1;
    text-shadow: 0 3px 16px rgba(0,0,0,.3);
  }
  .copy p {
    color: #dbe9ff; font-size: 34px; font-weight: 500; margin-top: 22px; line-height: 1.25;
  }
  </style></head><body>
  <img class="icon" src="data:image/png;base64,${icon}">
  <div class="copy"><h1>${title}</h1><p>${tagline}</p></div>
  </body></html>`;
}

if (mode !== "marquee") {
  const srcDir = join(ROOT, ext, "screenshots");
  const shots = readdirSync(srcDir).filter((f) => /\.png$/i.test(f)).sort();
  if (!shots.length) {
    console.error(`no PNGs in ${srcDir}`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  console.log(`framing ${shots.length} screenshot(s) -> store/screenshots/`);
  for (const file of shots) {
    const stem = file.replace(/\.png$/i, "");
    const buf = readFileSync(join(srcDir, file));
    const html = screenshotPage(buf, cfg.captions[stem] || "", cfg.crops?.[stem]);
    render(html, join(outDir, `${stem}.png`), 1280, 800);
    console.log(`  ${file} -> ${stem}.png`);
  }
}

if (cfg.marquee) {
  mkdirSync(storeDir, { recursive: true });
  render(marqueePage(), join(storeDir, "marquee.png"), 1400, 560);
  console.log("marquee -> store/marquee.png (1400x560)");
}
