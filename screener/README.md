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
- **Keyboard shortcut** — `Alt+Shift+S` (configurable at `chrome://extensions/shortcuts`)
  captures the visible area without opening the popup.
- **Three outputs** — **Download** (PNG), **Copy** to clipboard, or **Submit
  ticket** to a Laravel endpoint with a title and description.
- **Dark / light theme** — slate palette, follows OS preference, manual toggle.

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Capture the current tab (visible / selection / full page) without install-time host access. |
| `scripting` | Inject the selection overlay and the full-page scroll/measure helpers into the active tab. |
| `offscreen` | Run `getDisplayMedia` for full-screen capture — the service worker has no DOM. |
| `downloads` | Save the annotated PNG. |
| `clipboardWrite` | Copy the annotated PNG to the clipboard. |
| `storage` | Persist the endpoint URL, bearer token, and theme. |
| `optional_host_permissions` (`http`/`https`) | Requested **only** at submit time, for the configured endpoint's origin. Not requested at install. |

Captures are held transiently in IndexedDB and deleted as soon as the editor
reads them. Nothing is sent anywhere unless you click **Submit ticket**.

## Submitting tickets to a backend

The **Submit ticket** button POSTs to an endpoint you configure in Options. To
build the matching Laravel API (token issuance + upload route), hand
[`LARAVEL_BACKEND_PROMPT.md`](LARAVEL_BACKEND_PROMPT.md) to Claude inside your
Laravel project — it contains the exact request/response contract. Then paste the
endpoint URL and bearer token into Screener's Options page (gear icon).

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
  theme.js lib.js idb.js annotator.js app.css \
  vendor/konva.min.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
```

Excludes source/tooling/docs (`src/`, `node_modules/`, `test/`,
`eslint.config.js`, `icon.svg`, `icons/icon512.png`, `*.md`, `package*.json`).
`vendor/konva.min.js` **is** required at runtime — include it.

## Architecture

- `popup.html` / `popup.js` — the four capture-mode buttons.
- `background.js` — service worker: orchestrates each capture, runs the
  selection-crop and full-page-stitch on an OffscreenCanvas, manages the
  offscreen document, hands the image to the editor via IndexedDB.
- `offscreen.html` / `offscreen.js` — `getDisplayMedia` frame grab for full screen.
- `editor.html` / `editor.js` — annotation editor and the download / copy /
  submit outputs.
- `annotator.js` — Konva engine: layers, tools, undo/redo, full-res export.
- `options.html` / `options.js` — endpoint URL and bearer token.
- `theme.js` — shared light/dark controller.
- `lib.js` — pure helpers (filenames, crop scaling, scroll planning, URL
  validation), unit-tested with `node:test`.
- `idb.js` — IndexedDB capture handoff (read-once, delete).
- `vendor/konva.min.js` — vendored Konva UMD (loaded via `<script>`, no bundler).
- `src/styles.css` → `app.css` — Tailwind v4 source and compiled output.

Built with vanilla JS (ES modules) and Tailwind v4. Konva is the only runtime
dependency, vendored locally.
