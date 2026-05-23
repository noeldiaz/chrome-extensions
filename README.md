# Chrome Extensions

A monorepo of Chrome extensions. Each subdirectory is a self-contained
Manifest V3 extension with its own manifest, build, version, and tests.

## Layout

```
chrome-extensions/
  refresher/        Periodic tab refresher (MV3)
  screener/         Screenshot capture, annotate, and ticket submit (MV3)
  qrmaker/          QR code for the active tab's URL (MV3)
  <next-extension>/
```

The repo boundary is the workspace boundary — new extensions are added as
new subdirectories here, not as separate repos.

## Extensions

| Extension | Description |
|-----------|-------------|
| [refresher](refresher/) | Refresh chosen browser tabs on intervals you control |
| [screener](screener/) | Capture, annotate, and submit screenshots as support tickets |
| [qrmaker](qrmaker/) | Show a scannable QR code for the current tab's URL |

## Working in an extension

Each extension is independent. Work from its directory:

```bash
cd refresher
npm install        # one-time
npm run build:css  # compile Tailwind -> popup.css
npm test           # node:test unit tests
npm run lint       # eslint
```

### Load unpacked

1. `npm run build:css` in the extension directory (each extension's compiled CSS is committed, so this is only needed after CSS changes).
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the extension's directory.

## Conventions

- **Manifest V3**, service-worker background, narrow permissions.
- **Tailwind v4** compiled to a committed CSS file (`popup.css`, `app.css`, …) so the extension loads without a build step. CSP forbids remote/inline styles.
- Pure logic lives in a `lib.js`, unit-tested with **`node:test`** (no test-runner dependency). Third-party runtime libs, if any, are vendored locally (e.g. Screener's `vendor/konva.min.js`) — never remote-loaded.
- Per-extension versioning via each `manifest.json`; tag releases prefixed, e.g. `refresher-v0.4.1`, `screener-v0.1.0`.

## Requirements

Node 18+ (for the built-in `node:test` runner) and a Chromium browser. Minimum Chrome version is per-extension (Refresher 110+, Screener 116+, QRmaker 110+).
