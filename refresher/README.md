# Refresher

Refresh chosen browser tabs on periodic intervals you control. Manifest V3.

## Features

- **Multiple tabs** — refresh several tabs at once, each on its own interval. One alarm per tab.
- **Smart badge** — live `m:ss` countdown when exactly one tab is active; a tab count when two or more (so the service worker can sleep between refreshes instead of being pinned awake).
- **Scroll preservation** *(opt-in)* — restores scroll position after each reload. Requests host access only when you enable it.
- **Per-tab stats** — refresh count and "last refreshed" time per tab.
- **Skips audible tabs** — won't reload a tab that's playing audio; retries once on transient failure.
- **Survives page navigation** — keeps the target's title current.
- **Dark / light theme** — slate palette, follows OS preference, manual toggle.

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Persist targets, intervals, theme. |
| `alarms` | Schedule the periodic refreshes (Chrome's periodic minimum is 30s). |
| `tabs` | Reload tabs by id and keep their titles current after navigation. |
| `scripting` | Read/restore scroll position around a reload. |
| `optional_host_permissions` (`http`/`https`) | Requested **only** when scroll preservation is turned on; removed when turned off. |

No network requests. No data leaves the browser. State is stored locally via `chrome.storage.local`.

## Develop

```bash
npm install
npm run watch:css   # recompile popup.css on change
npm run lint
npm test
```

Load unpacked from `chrome://extensions` (Developer mode → Load unpacked → this directory).

## Package for distribution

Build CSS, then zip only the runtime files:

```bash
npm run build:css && zip refresher.zip \
  manifest.json popup.html popup.css popup.js background.js lib.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
```

Excludes source/tooling (`src/`, `node_modules/`, `eslint.config.js`, `test/`, `icon.svg`, `icons/icon512.png`).

## Architecture

- `background.js` — service worker: alarms, badge, reload logic, scroll capture/restore, stats.
- `popup.js` — popup UI: target list, countdown ticker, interval controls, theme.
- `lib.js` — pure helpers (formatting, clamping, alarm-name parsing, URL guards), shared by both and unit-tested.
- `src/styles.css` → `popup.css` — Tailwind v4 source and compiled output.

Built with vanilla JS (ES modules) and Tailwind v4. No runtime dependencies.
