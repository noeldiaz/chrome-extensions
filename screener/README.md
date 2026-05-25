# Screener

Capture, annotate, and submit screenshots for tech-support tickets. Manifest V3.

## Features

- **Four capture modes**
  - **Visible area** — the current viewport (`captureVisibleTab`).
  - **Selected area** — drag a region; cropped at device-pixel resolution.
  - **Full page** — scrolls top to bottom and stitches the tiles together; hides
    `fixed`/`sticky` elements after the first tile so headers don't repeat.
  - **Full screen** — a whole monitor or a window via `getDisplayMedia` in an
    offscreen document.
- **Annotation editor** *(Konva)* — rectangle, arrow, freehand pen, text, and two
  **redact** modes (solid block or pixelate) for hiding sensitive info;
  move/resize/delete, undo/redo, color and stroke width, zoom/pan. Exports at
  full resolution.
- **Numbered comment pins** — drop blue/white pins (#1, #2 …) on the image with
  the **Comment** tool; a floating card adds, edits, or erases each comment. Pins
  renumber automatically when one is deleted, hovering shows the comment, and on
  export a numbered legend strip is appended below the image listing every
  comment.
- **Keyboard shortcut** — `Alt+Shift+S` (configurable at `chrome://extensions/shortcuts`)
  captures the visible area without opening the popup.
- **Three outputs** — **Download** (PNG), **Copy** to clipboard, or **Submit
  ticket** to a Laravel endpoint with a title and description. **Submit ticket**
  is hidden until you configure an endpoint in Options → Tickets; Download and
  Copy always work.
- **Sync across devices** *(opt-in)* — a toggle in Options → Settings keeps the
  ticket endpoint and token in `chrome.storage.sync` across the devices where
  you're signed in to this browser. Off by default; everything else stays local.
- **Dark / light theme** — slate palette, follows OS preference, manual toggle.

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Capture the current tab (visible / selection / full page) without install-time host access. |
| `scripting` | Inject the selection overlay and the full-page scroll/measure helpers into the active tab. |
| `offscreen` | Run `getDisplayMedia` for full-screen capture — the service worker has no DOM. |
| `downloads` | Save the annotated PNG. |
| `clipboardWrite` | Copy the annotated PNG to the clipboard. |
| `storage` | Persist the endpoint URL, bearer token, theme, and the sync opt-in flag (in `chrome.storage.sync` when sync is enabled, otherwise `chrome.storage.local`). |
| `optional_host_permissions` (`http`/`https`) | Requested **only** at submit time, for the configured endpoint's origin. Not requested at install. |

Captures are held transiently in IndexedDB and deleted as soon as the editor
reads them. Nothing is sent anywhere unless you click **Submit ticket**.

## Submitting tickets to a backend

The **Submit ticket** button POSTs to an endpoint you configure in Options →
**Tickets**. Until an endpoint is set the button stays hidden in the editor, so
Download and Copy still work without a backend. To build the matching Laravel API
(token issuance + upload route), hand
[`LARAVEL_BACKEND_PROMPT.md`](LARAVEL_BACKEND_PROMPT.md) to Claude inside your
Laravel project — it contains the exact request/response contract. Then paste the
endpoint URL and bearer token into Screener's Options page (gear icon → Tickets
tab).

Request shape: `multipart/form-data` with `title`, `description`, `screenshot`
(PNG), `page_url`, `meta` (JSON), and `Authorization: Bearer <token>`. Success
returns `{ id, url? }`; errors return `{ message }`.

## Develop

```bash
npm install
npm run vendor:konva   # copy Konva's UMD dist into vendor/ (after updating it)
npm run watch:css      # recompile app.css on change
npm run lint
npm test
```

Load unpacked from `chrome://extensions` (Developer mode → Load unpacked → this
directory).

## Package for distribution

Build CSS, then zip only the runtime files:

```bash
npm run build:css && zip -r screener.zip \
  manifest.json popup.html popup.js editor.html editor.js \
  options.html options.js background.js offscreen.html offscreen.js \
  theme.js lib.js idb.js annotator.js i18n.js sync.js build-config.js app.css \
  _locales/ \
  vendor/konva.min.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
```

Excludes source/tooling/docs (`src/`, `node_modules/`, `test/`,
`eslint.config.js`, `icon.svg`, `icons/icon512.png`, `*.md`, `package*.json`).
`vendor/konva.min.js` **is** required at runtime — include it.

## Safari & Firefox

A shared `build.mjs` at the repo root emits per-target builds under
`dist/<target>/`:

```bash
node ../build.mjs firefox screener   # → dist/firefox/screener
node ../build.mjs safari screener    # → dist/safari/screener
```

See [`../SAFARI.md`](../SAFARI.md) for the full cross-browser build, packaging,
and signing flow. Screener-specific notes:

- On **both** Safari and Firefox the **Full screen** (offscreen `getDisplayMedia`)
  capture is turned off (`build.mjs` clears `fullscreenCapture`), so the popup
  hides that mode. Visible-area, selection, and full-page (scroll-and-stitch)
  capture still work.
- **Safari** has no `chrome.downloads`, so Download falls back to a plain
  `<a download>` from the editor tab (`build.mjs` clears `nativeDownloads`).
- **Firefox** keeps `chrome.downloads`, so Download uses it as on Chrome.

## Architecture

- `popup.html` / `popup.js` — the four capture-mode buttons.
- `background.js` — service worker: orchestrates each capture, runs the
  selection-crop and full-page-stitch on an OffscreenCanvas, manages the
  offscreen document, hands the image to the editor via IndexedDB.
- `offscreen.html` / `offscreen.js` — `getDisplayMedia` frame grab for full screen.
- `editor.html` / `editor.js` — annotation editor and the download / copy /
  submit outputs; gates **Submit ticket** on a configured endpoint.
- `annotator.js` — Konva engine: layers, tools (including numbered comment
  pins), undo/redo, full-res export with the comment legend strip.
- `options.html` / `options.js` — tabbed options: **Settings** (sync toggle),
  **Tickets** (endpoint URL + bearer token + what-gets-sent), and **About**.
- `sync.js` — opt-in cross-device sync helper: routes `endpoint`/`token` to
  `chrome.storage.sync` when enabled, otherwise `chrome.storage.local`.
- `build-config.js` — per-target feature flags (`fullscreenCapture`,
  `nativeDownloads`); overwritten by `build.mjs` for each browser target.
- `theme.js` — shared light/dark controller.
- `i18n.js` / `_locales/` — localization helper and message catalogs. `i18n.js`
  applies the catalog to each page at load (`data-i18n` → `textContent`,
  `data-i18n-attr` → attributes) and exposes `t()` for JS strings; the manifest
  `name`/`description` resolve from `_locales/<lang>/messages.json` via
  `__MSG_*__`. `en` is the default locale.
- `lib.js` — pure helpers (filenames, crop scaling, scroll planning, URL
  validation), unit-tested with `node:test`.
- `idb.js` — IndexedDB capture handoff (read-once, delete).
- `vendor/konva.min.js` — vendored Konva UMD (loaded via `<script>`, no bundler).
- `src/styles.css` → `app.css` — Tailwind v4 source and compiled output.

Built with vanilla JS (ES modules) and Tailwind v4. Konva is the only runtime
dependency, vendored locally.
