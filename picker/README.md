# Picker

A Chrome (MV3) colour picker: click the toolbar icon, pick any colour on screen
with the eyedropper, and copy it in any format in one click. Organised into three
tabs — **Color**, **Page**, **Tools**.

## Features

- **Screen eyedropper** — uses the native [`EyeDropper`](https://developer.mozilla.org/docs/Web/API/EyeDropper) API to sample any pixel on screen (Chromium 95+).
- **Formats** — the picked colour as copy-pills: HEX / RGB / HSL / HSV / OKLCH / RGBA / HSLA / 8-digit hex, plus the **nearest Tailwind colour** (OKLab match, e.g. `blue-600`). Choose which are "favourites" (shown first) in Settings; the rest sit under *Other Formats*. Click a pill (or the swatch) to copy — it flashes green.
- **Shades** — a 50–950 OKLCH ramp from the pick, with the step nearest your colour marked.
- **Page colours** — the **Page** tab extracts the current tab's most-used colours from its computed styles; click one to load it.
- **Contrast checker** (Tools) — your colour vs a chosen background → WCAG ratio + AA/AAA pass for normal/large text.
- **Favourites** — save named colours; rename, remove, JSON export/import.
- **Recent colours** — your last 12 picks (local only); remove individually or clear all (with confirmation). The most recent is restored on open.
- **Manual choice** (Tools) — a native colour box (and the fallback where EyeDropper is unsupported, e.g. Safari/Firefox).
- **Dark mode**, and a keyboard shortcut **Alt+Shift+P** (rebindable at `chrome://extensions/shortcuts`).

## Permissions

- **`storage`** — theme, settings, recent colours, favourites (all local).
- **`activeTab`** + **`scripting`** — only for the **Page** tab: when you click
  "Scan this page", Picker reads the current tab's colours from its computed
  styles. It runs only on that tab, only on your click, reads colour values only,
  and sends nothing anywhere.

No network requests. The eyedropper is a built-in browser API and needs no permission.
See [PRIVACY.md](PRIVACY.md).

## Develop

```bash
npm install
npm run build:css   # compile src/styles.css -> popup.css (committed)
npm run lint
npm test            # node:test, pure colour math in lib.js
```

Load unpacked from this folder at `chrome://extensions` (Developer mode → Load
unpacked). The compiled `popup.css` is committed, so no build step is needed to
load it.

## Architecture

- `popup.html` / `popup.js` — the only UI surface. No background service worker.
- `lib.js` — pure, DOM-free colour math (`normalizeHex`, `hexToRgb`, `rgbToHsl`,
  `rgbToHsv`, `rgbToOklab`, `nearestTailwind`, formatters, `contrastText`);
  unit-tested headless with `node:test`.
- `palette.js` — generated Tailwind colour table (name + hex + OKLab) read by
  `nearestTailwind`. Regenerate if Tailwind is upgraded (script noted in commit history).
- `theme.js` / `i18n.js` — shared theme + localisation helpers (workspace convention).

## Safari

The `EyeDropper` API is Chromium-only, so on Safari the screen-pick button is
disabled and the native colour box takes over (still shows HEX/RGB/HSL + recent).
Build the Safari target from the repo root: `node build.mjs safari picker`.

## License

MIT © 2026 Noel Diaz
