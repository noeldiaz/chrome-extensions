#!/usr/bin/env node
// Build the extensions into dist/<target>/<ext>/ with per-target feature flags.
//
//   node build.mjs                 # chrome (default), all extensions
//   node build.mjs safari          # safari, all extensions
//   node build.mjs firefox         # firefox, all extensions
//   node build.mjs all             # every target, all extensions
//   node build.mjs safari screener # one target, one extension
//
// One codebase: the source folders are the Chromium build as-is (so load-unpacked
// works without a build step). Per-target differences are applied here:
//   - manifest permissions stripped (e.g. Safari has no offscreen/downloads),
//   - a generated build-config.js flips runtime FEATURES off,
//   - unsupported files dropped from the output.
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");
const EXTENSIONS = ["qrmaker", "refresher", "screener", "picker", "blocker"];

// Modules kept canonical in shared/ and overlaid into each extension's output, so
// a release is always built from the single source of truth (the committed
// per-extension copies are for load-unpacked dev). See shared/README.md.
const SHARED = JSON.parse(readFileSync(join(ROOT, "shared", "files.json"), "utf8"));

const TARGETS = {
  chrome: {
    features: { fullscreenCapture: true, nativeDownloads: true },
    dropPermissions: [],
    dropFiles: [],
  },
  edge: {
    // Edge is Chromium — identical manifest, permissions, and features to Chrome
    // (offscreen, downloads, EyeDropper all supported). Separate target only so
    // there's a clearly-labelled package to submit to the Edge Add-ons store.
    features: { fullscreenCapture: true, nativeDownloads: true },
    dropPermissions: [],
    dropFiles: [],
  },
  safari: {
    // No offscreen document and no getDisplayMedia in the extension context, so
    // screen capture is off; chrome.downloads is unsupported, fall back to <a>.
    features: { fullscreenCapture: false, nativeDownloads: false },
    dropPermissions: ["offscreen", "downloads"],
    dropFiles: ["offscreen.html", "offscreen.js"],
  },
  firefox: {
    // Firefox MV3: no offscreen API (so no full-page capture), but chrome.downloads
    // is supported. Background runs as an event page, not a service worker, and an
    // add-on id is required — see transformManifest's gecko branch.
    features: { fullscreenCapture: false, nativeDownloads: true },
    dropPermissions: ["offscreen"],
    dropFiles: ["offscreen.html", "offscreen.js"],
    gecko: true,
  },
};

// Never shipped in a build — tooling, sources, dev-only files.
const EXCLUDE = new Set([
  "node_modules",
  "src",
  "test",
  "scripts",
  "enterprise",
  "screenshots", // raw store-listing grabs — not shipped
  "store", // framed store assets (screenshots, marquee) — not shipped
  "icon.svg", // icon source — runtime uses the PNGs in icons/
  "eslint.config.js",
  "package.json",
  "package-lock.json",
  ".gitignore",
  ".DS_Store",
]);

// Docs never belong in a shipped package (privacy policy goes in the store listing).
const EXCLUDE_RE = /\.md$/i;

// Cruft to drop anywhere in the tree (copied subdirs would otherwise carry it):
// macOS metadata, and the 512px icon source (the manifest ships 16/32/48/128 only;
// 512 is kept in source for the store-asset compositor).
const SKIP_RE = /(^|\/)\.DS_Store$|(^|\/)icon512\.png$/;

function buildCss(srcDir, ext) {
  try {
    execSync("npm run build:css", { cwd: srcDir, stdio: "ignore" });
  } catch {
    console.warn(`  ! build:css failed for ${ext} — copying existing compiled CSS`);
  }
}

function copyExt(srcDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    if (EXCLUDE.has(name) || EXCLUDE_RE.test(name)) continue;
    cpSync(join(srcDir, name), join(outDir, name), {
      recursive: true,
      filter: (src) => !SKIP_RE.test(src),
    });
  }
}

// Overlay the canonical shared modules from shared/ onto the output (authoritative
// over the committed per-extension copy).
function overlayShared(outDir, ext) {
  for (const [file, exts] of Object.entries(SHARED)) {
    if (exts.includes(ext)) cpSync(join(ROOT, "shared", file), join(outDir, file));
  }
}

function transformManifest(outDir, target, ext) {
  if (!target.dropPermissions.length && !target.gecko) return;
  const p = join(outDir, "manifest.json");
  const m = JSON.parse(readFileSync(p, "utf8"));
  if (target.dropPermissions.length && Array.isArray(m.permissions)) {
    m.permissions = m.permissions.filter((x) => !target.dropPermissions.includes(x));
  }
  if (target.gecko) {
    // Firefox MV3 runs the background as a non-persistent event page (no service
    // worker), needs a stable add-on id, and ignores Chromium-only keys.
    if (m.background?.service_worker) {
      m.background = {
        scripts: [m.background.service_worker],
        ...(m.background.type ? { type: m.background.type } : {}),
      };
    }
    m.browser_specific_settings = { gecko: { id: `${ext}@noeldiaz.dev`, strict_min_version: "121.0" } };
    delete m.minimum_chrome_version;
  }
  writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
}

// Only the extensions that import ./build-config.js get one regenerated; the
// committed source copy stays the Chromium dev default.
function writeBuildConfig(srcDir, outDir, targetName, target) {
  if (!existsSync(join(srcDir, "build-config.js"))) return;
  const body = `// GENERATED by build.mjs for target "${targetName}" — do not edit.
export const TARGET = ${JSON.stringify(targetName)};
export const FEATURES = ${JSON.stringify(target.features)};
`;
  writeFileSync(join(outDir, "build-config.js"), body);
}

function dropFiles(outDir, target) {
  for (const f of target.dropFiles) rmSync(join(outDir, f), { force: true });
}

function build(targetName, only) {
  const target = TARGETS[targetName];
  if (!target) {
    console.error(`Unknown target "${targetName}". Known: ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
  }
  for (const ext of only ? [only] : EXTENSIONS) {
    const srcDir = join(ROOT, ext);
    const outDir = join(DIST, targetName, ext);
    console.log(`• ${ext} → dist/${targetName}/${ext}`);
    buildCss(srcDir, ext);
    rmSync(outDir, { recursive: true, force: true });
    copyExt(srcDir, outDir);
    overlayShared(outDir, ext);
    transformManifest(outDir, target, ext);
    writeBuildConfig(srcDir, outDir, targetName, target);
    dropFiles(outDir, target);
  }
}

const [, , targetArg = "chrome", extArg] = process.argv;
const targets = targetArg === "all" ? Object.keys(TARGETS) : [targetArg];
for (const tn of targets) build(tn, extArg);
console.log("done.");
