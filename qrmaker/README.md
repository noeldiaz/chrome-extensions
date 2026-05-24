# QRmaker

Click the toolbar icon to show a scannable QR code for the current tab's URL.
Manifest V3.

## Features

- **One-click QR** — the popup encodes the active tab's URL into a QR code you
  can scan with a phone to open the page there.
- **Download** — save the code as **PNG**, **SVG** (vector), or **JPG** via the
  format dropdown.
- **Copy** — copy the QR image to the clipboard (PNG) for pasting anywhere.
- **Quick colors** *(popup)* — a collapsible Options panel with inside /
  outside / background **colors** and a Reset. Dot & corner style, gradient,
  logo, size, and error-correction live in the advanced editor (or come from
  your default preset). The panel also has a **More types** shortcut that opens
  the editor ready to build a Wi-Fi / contact / email / SMS / phone / location
  code.
- **Advanced editor** *(new tab)* — dot and corner style chips, separate dot /
  corner / background colors, a background **gradient** (linear or radial),
  margin, an export-size slider, and a **center logo** you
  upload (saved to a personal logo library), with a live preview and
  PNG / SVG / JPG / copy output.
- **Structured types** *(editor)* — pick a **Type** to encode more than plain
  text: a **Wi-Fi** network (SSID / password / security / hidden), a **contact
  card** (vCard), an **email** (mailto), an **SMS**, a **phone** number, or a
  **map location** (geo, with a one-tap **Use my location**). The matching fields
  appear and compose the payload for you, and re-opening one from History
  rebuilds its form.
- **Frame / "Scan me" card** *(editor)* — wrap the code in a printable card: a
  caption above it (your text, any color) on a solid or **gradient** background,
  with the code on a white rounded tile. Exports as PNG / JPG (or copy).
- **Design presets** *(editor)* — save the whole design (style, colors,
  gradient, sizes, logo, and frame) as a named preset, reapply it from a
  dropdown, and mark one as the **default** that loads automatically (and styles
  the popup's quick code too).
- **Right-click menus** — make a code for the **page**, a **link**, a **text
  selection**, or an **image address**; opens the editor prefilled.
- **Decode / scan** — right-click any image → **Scan QR code from this image**,
  right-click a page → **Scan QR codes on this page** (finds and decodes every QR
  rendered on it), or use the popup's **Scan** button to read a QR from a local
  image file (or **drag & drop / paste** an image into the scan window) or, with
  **Scan with camera**, a live webcam feed. Decoded content
  opens in a small window with **Go to** / **Copy** / **Edit** (open the result
  in the advanced editor to restyle and re-export) per result. Camera frames and
  page pixels are decoded locally and never leave the browser.
- **History** — every code you download or copy is logged (content, source,
  date) to a **History** page (clock icon in the popup/editor, or right-click the
  toolbar icon). Re-open any past code in the editor to tweak it, delete rows, or
  clear all. Kept locally in IndexedDB, capped at the newest 200.
- **Always scannable** — rendered black-on-white on a card regardless of the
  popup's light/dark theme, with a proper quiet-zone margin.
- **Keyboard shortcut** — open the popup with **Alt+Shift+Q** (rebind at
  `chrome://extensions/shortcuts`).
- **Dark / light theme** — slate palette, follows OS preference, manual toggle.

The popup pre-fills the active tab's URL, but the field takes **any URL or
text** — edit it to encode whatever you like. A `chrome://` or Web Store URL
still encodes, but a code of one can't be opened by scanning it on another
device.

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Read the current tab's URL when you open the popup. No install-time host access. |
| `storage` | Remember your theme, design presets, and default preset. |
| `clipboardWrite` | Copy the QR image to the clipboard. |
| `contextMenus` | Add the right-click "Create QR code…" and "Scan…" entries. |
| `scripting` | Inject the decoder into the current tab when you choose "Scan QR codes on this page" — paired with `activeTab`, so only that tab, only on your click. |
| `optional_host_permissions` (`http`/`https`) | Requested **only** when you scan a QR from an image hosted on another site (needed to fetch its pixels). Not requested at install; same-origin and `data:` images need no grant. |

QRmaker generates and decodes codes locally. It only reaches the network when you
scan a cross-origin image (to fetch that one image), after you grant access. See
[PRIVACY.md](PRIVACY.md) for the full privacy policy.

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
  manifest.json popup.html popup.js editor.html editor.js result.html result.js \
  history.html history.js background.js scanpage.js lib.js idb.js theme.js icons.js popup.css \
  vendor/qr-code-styling.js vendor/jsqr.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
```

Excludes source/tooling (`src/`, `node_modules/`, `test/`, `eslint.config.js`,
`icon.svg`, `icons/icon512.png`, `*.md`, `package*.json`).
`vendor/qr-code-styling.js` and `vendor/jsqr.js` **are** required at runtime —
include them.

## Architecture

- `popup.html` / `popup.js` — reads the active tab, renders the QR with
  qr-code-styling, the Options panel, and download / copy.
- `editor.html` / `editor.js` — the advanced design editor (opens in a tab,
  prefilled via `?data=`). Hosts the structured-type forms (Wi-Fi, vCard, email,
  SMS, phone, location) that compose the payload via `lib.js` builders. Also
  composites the optional "Scan me" card (caption + background + white code tile)
  to a canvas for PNG / JPG export.
- `background.js` — service worker: right-click context menus that open the
  editor (encode) or the scan window (decode), and the "scan this page" action
  that injects the decoder into the active tab.
- `scanpage.js` — injected into the active tab (with `vendor/jsqr.js`) to find
  and decode every QR code rendered on the page; returns the results.
- `result.html` / `result.js` — the scan window: decodes an uploaded or
  right-clicked image with jsQR and shows the content (Go to / Copy / Close), or
  lists every code found by a page scan.
- `history.html` / `history.js` — the History page: lists created codes (from
  the `history` IndexedDB store) with re-encoded previews, re-open in editor,
  delete, and clear-all.
- `vendor/jsqr.js` — vendored [jsQR](https://github.com/cozmo/jsQR)
  (Apache-2.0) decoder, loaded via classic `<script>`.
- `lib.js` — pure helpers (URL gating, display truncation, download filename,
  clamp, deg→rad, card geometry, and the structured-type payload builders for
  Wi-Fi / vCard / email / SMS / tel / geo), unit-tested with `node:test`.
- `theme.js` — shared light/dark theme wiring (`initTheme`) used by every page.
- `icons.js` — shared inline SVG icon strings for the JS-built rows in the scan
  and history pages.
- `idb.js` — IndexedDB (DB `qrmaker`): the editor's uploaded center-logo library
  (`logos`) and the created-codes `history` store.
- `vendor/qr-code-styling.js` — vendored [qr-code-styling](https://github.com/kozakdenys/qr-code-styling)
  (MIT; bundles qrcode-generator), loaded via classic `<script>`, no bundler.
  Renders styled codes and exports PNG / SVG / JPG / WebP.
- `src/styles.css` → `popup.css` — Tailwind v4 source and compiled output.

Vanilla JS (ES module). qr-code-styling is the only runtime dependency,
vendored locally.

## License

QRmaker is [MIT](LICENSE) licensed. The vendored libraries keep their own
licenses: qr-code-styling (MIT) and jsQR (Apache-2.0).
