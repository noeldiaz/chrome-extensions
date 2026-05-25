# Picker

A Chrome (MV3) color picker: click the toolbar icon, pick any color on screen
with the eyedropper, and copy it in any format in one click. Organised into three
tabs — **Color**, **Page**, **Tools**.

## Features

- **Screen eyedropper** — uses the native [`EyeDropper`](https://developer.mozilla.org/docs/Web/API/EyeDropper) API to sample any pixel on screen (Chromium 95+).
- **Formats** — the picked color as copy-pills: HEX / RGB / HSL / HSV / OKLCH / RGBA / HSLA / 8-digit hex, plus the **nearest Tailwind color** (OKLab match, e.g. `blue-600`). Choose which are "favorites" (shown first) in Settings; the rest sit under *Other Formats*. Click a pill (or the swatch) to copy — it flashes green.
- **Shades** — a 50–950 OKLCH ramp from the pick, with the step nearest your color marked.
- **Adjust** — fine-tune the picked color with H / S / L sliders; everything re-renders live.
- **Harmonies** — color-wheel schemes from the pick (complementary, analogous, triadic, split-complementary, tetradic); click any swatch to load it.
- **Code** — the color as a developer literal you can copy: CSS custom property, SwiftUI `Color`, UIKit `UIColor`, Android `0xFF…`, Flutter `Color(0xFF…)`, and a Unity/`float` triplet.
- **Page colors** — the **Page** tab extracts the current tab's most-used colors from its computed styles; click one to load it.
- **Contrast checker** (Tools) — your color vs a chosen background → WCAG ratio + AA/AAA pass for normal/large text, plus a perceptual **APCA** `Lc` reading. When the pick fails AA, it suggests the nearest **accessible shade** from its own ramp.
- **Color Vision** (Tools) — preview the pick as seen with protanopia, deuteranopia, and tritanopia; click a cell to load that simulated color.
- **Gradient** builder (Tools) — linear / radial / conic gradients from 2–5 stops (the first follows your pick until you edit it); copy the CSS in one click.
- **Export** (Tools) — emit the shade ramp or a harmony as **CSS custom properties**, a **Tailwind** config object, or **JSON**.
- **Favorites** — save named colors; rename, remove, JSON export/import.
- **Recent colors** — your last 12 picks; remove individually or clear all (with confirmation). The most recent is restored on open. The popup shows the latest few with a *More* link into Settings.
- **Manual choice** (Tools) — a native color box (and the fallback where EyeDropper is unsupported, e.g. Safari/Firefox).
- **Sync across devices** — an opt-in toggle (Settings) that keeps your settings, favorites, and recent colors in `chrome.storage.sync` across signed-in devices. Off by default; everything stays local otherwise.
- **Dark mode**, and a keyboard shortcut **Alt+Shift+P** (rebindable at `chrome://extensions/shortcuts`).

## Permissions

- **`storage`** — theme, settings, recent colors, favorites. Local by default; moved to synced storage only if you turn on "Sync across devices".
- **`activeTab`** + **`scripting`** — only for the **Page** tab: when you click
  "Scan this page", Picker reads the current tab's colors from its computed
  styles. It runs only on that tab, only on your click, reads color values only,
  and sends nothing anywhere.

No network requests. The eyedropper is a built-in browser API and needs no permission.
See [PRIVACY.md](PRIVACY.md).

## Develop

```bash
npm install
npm run build:css   # compile src/styles.css -> popup.css (committed)
npm run lint
npm test            # node:test, pure color math in lib.js
```

Load unpacked from this folder at `chrome://extensions` (Developer mode → Load
unpacked). The compiled `popup.css` is committed, so no build step is needed to
load it.

## Architecture

- `popup.html` / `popup.js` — the only UI surface. No background service worker.
- `options.html` / `options.js` — the settings page (formats, copy-on-pick, HEX
  case, sync toggle, recent colors, about).
- `lib.js` — pure, DOM-free color math (`normalizeHex`, `hexToRgb`, `rgbToHsl`,
  `rgbToHsv`, `rgbToOklab`/`rgbToOklch`, `nearestTailwind`, `ramp`, `harmonies`,
  the developer formatters, `simulateCvd`, `apcaContrast`, `accessibleShade`,
  `gradientCss`, `exportPalette`, …); unit-tested headless with `node:test`.
- `palette.js` — generated Tailwind color table (name + hex + OKLab) read by
  `nearestTailwind`. Regenerate with `npm run gen:palette` if Tailwind is upgraded.
- `theme.js` / `i18n.js` / `sync.js` / `dialog.js` — shared theme, localisation,
  optional cross-device sync, and confirm-modal helpers (workspace conventions).

## Other browsers

Picker also builds for Safari and Firefox from the repo root:

```bash
node build.mjs safari picker     # → dist/safari/picker
node build.mjs firefox picker    # → dist/firefox/picker
```

On **both** Safari and Firefox the `EyeDropper` API is unavailable, so the
screen-pick button is disabled and the native color box takes over. Everything
else — `storage.sync`, the `scripting` page-scan, all formats, and the shade
ramp — works. See [../SAFARI.md](../SAFARI.md) for packaging, signing, and the
per-target details.

## License

MIT © 2026 Noel Diaz
