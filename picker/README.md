# Picker

A minimal Chrome (MV3) extension: click the toolbar icon, pick any colour on
screen with the eyedropper, and copy its **HEX**, **RGB**, or **HSL** value in
one click.

## Features

- **Screen eyedropper** — uses the native [`EyeDropper`](https://developer.mozilla.org/docs/Web/API/EyeDropper) API to sample any pixel on screen (Chromium 95+).
- **Values** — the picked colour shows as a swatch plus HEX / RGB / HSL; click a row to copy.
- **Manual choice** — a native colour box as a fallback (and for browsers without the eyedropper, e.g. Safari/Firefox).
- **Recent colours** — your last 12 picks are kept (local only); click one to reload it.
- **Dark mode** — follows the OS, toggle to override; remembered per browser.
- Keyboard shortcut **Alt+Shift+P** (rebindable at `chrome://extensions/shortcuts`).

## Permissions

`storage` only — for the theme choice and recent colours. No host access, no
network, nothing leaves the browser. The eyedropper is a built-in browser API
and needs no permission.

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
  formatters, `contrastText`); unit-tested headless with `node:test`.
- `theme.js` / `i18n.js` — shared theme + localisation helpers (workspace convention).

## Safari

The `EyeDropper` API is Chromium-only, so on Safari the screen-pick button is
disabled and the native colour box takes over (still shows HEX/RGB/HSL + recent).
Build the Safari target from the repo root: `node build.mjs safari picker`.

## License

MIT © 2026 Noel Diaz
