# QRmaker

Click the toolbar icon to show a scannable QR code for the current tab's URL.
Manifest V3.

## Features

- **One-click QR** — the popup encodes the active tab's URL into a QR code you
  can scan with a phone to open the page there.
- **Download** — save the code as **PNG**, **SVG** (vector), or **JPG** via the
  format dropdown.
- **Copy** — copy the QR image to the clipboard (PNG) for pasting anywhere.
- **Quick options** *(popup)* — a collapsible Options panel: content type
  (page URL or custom text), dot style, export size, error-correction level, and
  inside / outside / background colors.
- **Advanced editor** *(new tab)* — dot and corner style chips, separate dot /
  corner / background colors, a background **gradient** (linear or radial),
  margin, error correction, an export-size slider, and a **center logo** you
  upload (saved to a personal logo library), with a live preview and
  PNG / SVG / JPG / copy output.
- **Design presets** *(editor)* — save the whole design (style, colors,
  gradient, sizes, logo) as a named preset, reapply it from a dropdown, and mark
  one as the **default** that loads automatically (and styles the popup's quick
  code too).
- **Right-click menus** — make a code for the **page**, a **link**, a **text
  selection**, or an **image address**; opens the editor prefilled.
- **Always scannable** — rendered black-on-white on a card regardless of the
  popup's light/dark theme, with a proper quiet-zone margin.
- **Dark / light theme** — slate palette, follows OS preference, manual toggle.

Non-web pages (`chrome://`, the Web Store, local files) show a short notice
instead — but you can still switch the popup's Type to **Custom text** to encode
anything.

Planned next: frame / "Scan Me" text, a history of created codes, and
right-click / in-page decoding (scan a QR image back to its content).

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Read the current tab's URL when you open the popup. No install-time host access. |
| `storage` | Remember your theme, design presets, and default preset. |
| `clipboardWrite` | Copy the QR image to the clipboard. |
| `contextMenus` | Add the right-click "Create QR code…" entries. |

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
  manifest.json popup.html popup.js editor.html editor.js background.js lib.js idb.js popup.css \
  vendor/qr-code-styling.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
```

Excludes source/tooling (`src/`, `node_modules/`, `test/`, `eslint.config.js`,
`icon.svg`, `icons/icon512.png`, `*.md`, `package*.json`).
`vendor/qr-code-styling.js` **is** required at runtime — include it.

## Architecture

- `popup.html` / `popup.js` — reads the active tab, renders the QR with
  qr-code-styling, the Options panel, and download / copy.
- `editor.html` / `editor.js` — the advanced design editor (opens in a tab,
  prefilled via `?data=`).
- `background.js` — service worker: right-click context menus that open the
  editor for the page / link / selection / image.
- `lib.js` — pure helpers (URL gating, display truncation, download filename,
  clamp, deg→rad), unit-tested with `node:test`.
- `idb.js` — IndexedDB store for the editor's uploaded center-logo library.
- `vendor/qr-code-styling.js` — vendored [qr-code-styling](https://github.com/kozakdenys/qr-code-styling)
  (MIT; bundles qrcode-generator), loaded via classic `<script>`, no bundler.
  Renders styled codes and exports PNG / SVG / JPG / WebP.
- `src/styles.css` → `popup.css` — Tailwind v4 source and compiled output.

Vanilla JS (ES module). qr-code-styling is the only runtime dependency,
vendored locally.
