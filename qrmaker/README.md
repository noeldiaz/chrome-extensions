# QRmaker

Click the toolbar icon to show a scannable QR code for the current tab's URL.
Manifest V3.

## Features

- **One-click QR** — the popup encodes the active tab's URL into a QR code you
  can scan with a phone to open the page there.
- **Download** — save the code as **PNG**, **SVG** (vector), or **JPG** via the
  format dropdown.
- **Copy** — copy the QR image to the clipboard (PNG) for pasting anywhere.
- **Always scannable** — rendered black-on-white on a card regardless of the
  popup's light/dark theme, with a proper quiet-zone margin.
- **Dark / light theme** — slate palette, follows OS preference, manual toggle.

Non-web pages (`chrome://`, the Web Store, local files) show a short notice
instead — a QR of those can't be opened on another device.

Planned next: an advanced editor (custom text, colors, gradients, dot styles,
center logo, saved presets) and right-click context menus to encode links /
selections / images and decode codes on the page.

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Read the current tab's URL when you open the popup. No install-time host access. |
| `storage` | Remember your light/dark theme choice. |
| `clipboardWrite` | Copy the QR image to the clipboard. |

QRmaker sends nothing anywhere — the code is generated locally in the popup.

## Develop

```bash
npm install
npm run vendor:qr   # copy qr-code-styling's UMD dist into vendor/ (after updating it)
npm run watch:css   # recompile popup.css on change
npm run lint
npm test
```

Load unpacked from `chrome://extensions` (Developer mode → Load unpacked → this
directory).

## Package for distribution

```bash
npm run build:css && zip -r qrmaker.zip \
  manifest.json popup.html popup.js lib.js popup.css \
  vendor/qr-code-styling.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
```

Excludes source/tooling (`src/`, `node_modules/`, `test/`, `eslint.config.js`,
`icon.svg`, `icons/icon512.png`, `*.md`, `package*.json`).
`vendor/qr-code-styling.js` **is** required at runtime — include it.

## Architecture

- `popup.html` / `popup.js` — reads the active tab, renders the QR with
  qr-code-styling, and handles download / copy.
- `lib.js` — pure helpers (URL gating, display truncation, download filename),
  unit-tested with `node:test`.
- `vendor/qr-code-styling.js` — vendored [qr-code-styling](https://github.com/kozakdenys/qr-code-styling)
  (MIT; bundles qrcode-generator), loaded via classic `<script>`, no bundler.
  Renders styled codes and exports PNG / SVG / JPG / WebP.
- `src/styles.css` → `popup.css` — Tailwind v4 source and compiled output.

Vanilla JS (ES module). qr-code-styling is the only runtime dependency,
vendored locally.
