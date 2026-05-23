# QRmaker

Click the toolbar icon to show a scannable QR code for the current tab's URL.
Manifest V3.

## Features

- **One-click QR** — the popup encodes the active tab's URL into a QR code you
  can scan with a phone to open the page there.
- **Always scannable** — rendered black-on-white on a card regardless of the
  popup's light/dark theme, with a proper quiet-zone margin.
- **Dark / light theme** — slate palette, follows OS preference, manual toggle.

Non-web pages (`chrome://`, the Web Store, local files) show a short notice
instead — a QR of those can't be opened on another device.

More to come (download PNG, copy image, encode custom text). This is v0.1.

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Read the current tab's URL when you open the popup. No install-time host access. |
| `storage` | Remember your light/dark theme choice. |

QRmaker sends nothing anywhere — the code is generated locally in the popup.

## Develop

```bash
npm install
npm run vendor:qr   # copy qrcode-generator's UMD dist into vendor/ (after updating it)
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
  vendor/qrcode.min.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
```

Excludes source/tooling (`src/`, `node_modules/`, `test/`, `eslint.config.js`,
`icon.svg`, `icons/icon512.png`, `*.md`, `package*.json`).
`vendor/qrcode.min.js` **is** required at runtime — include it.

## Architecture

- `popup.html` / `popup.js` — reads the active tab, draws the QR on a `<canvas>`.
- `lib.js` — pure helpers (URL gating, display truncation, canvas layout math),
  unit-tested with `node:test`.
- `vendor/qrcode.min.js` — vendored [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
  (MIT), loaded via classic `<script>`, no bundler.
- `src/styles.css` → `popup.css` — Tailwind v4 source and compiled output.

Vanilla JS (ES module). qrcode-generator is the only runtime dependency,
vendored locally.
