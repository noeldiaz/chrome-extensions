# Refresher

Refresh chosen browser tabs on periodic intervals you control. Manifest V3.

## Features

- **Multiple tabs** — refresh several tabs at once, each on its own interval. One alarm per tab.
- **Smart badge** — live `m:ss` countdown when exactly one tab is active; a tab count when two or more (so the service worker can sleep between refreshes instead of being pinned awake).
- **Scroll preservation** *(opt-in)* — restores scroll position after each reload. Requests host access only when you enable it.
- **Per-tab stats** — refresh count and "last refreshed" time per tab.
- **Skips audible tabs** — won't reload a tab that's playing audio; retries once on transient failure.
- **Survives page navigation** — keeps the target's title current.
- **Sync across devices** *(opt-in)* — a toggle in Options syncs your refresh defaults (interval minutes/seconds + scroll preservation) across the devices you're signed in to. Per-tab refresh rules and transient tab state stay local. Off by default.
- **Dark / light theme** — slate palette, follows OS preference, manual toggle.

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Persist targets, intervals, theme; sync refresh defaults across devices when the Sync toggle is on. |
| `alarms` | Schedule the periodic refreshes (Chrome's periodic minimum is 30s). |
| `tabs` | Reload tabs by id and keep their titles current after navigation. |
| `scripting` | Read/restore scroll position around a reload. |
| `optional_host_permissions` (`http`/`https`) | Requested **only** when scroll preservation is turned on; removed when turned off. |

No network requests of its own. State is stored locally via `chrome.storage.local`; with the **Sync across devices** toggle on, the refresh defaults are also held in `chrome.storage.sync` (synced by the browser to your account). Per-tab targets always stay local.

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
npm run build:css && zip -r refresher.zip \
  manifest.json popup.html popup.css popup.js options.html options.js background.js lib.js i18n.js sync.js \
  _locales \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
```

Excludes source/tooling (`src/`, `node_modules/`, `eslint.config.js`, `test/`, `icon.svg`, `icons/icon512.png`).

## Architecture

- `background.js` — service worker (`type: module`): alarms, badge, reload logic, scroll capture/restore, stats.
- `popup.js` — popup UI: target list, countdown ticker, interval controls, theme.
- `options.js` / `options.html` — options page: the **Sync across devices** toggle, About panel, theme.
- `sync.js` — opt-in cross-device sync. A `syncEnabled` flag in `chrome.storage.local` selects the active area (`sync` when on, else `local`) for the refresh defaults (`minutes`, `seconds`, `preserveScroll`); toggling migrates those keys between the two areas. Targets and transient state always use `chrome.storage.local`.
- `lib.js` — pure helpers (formatting, clamping, alarm-name parsing, URL guards), shared by popup/background and unit-tested.
- `i18n.js` / `_locales/` — localization. `_locales/en/messages.json` is the message catalog; `i18n.js`'s `localize()` applies it to each page on load via `data-i18n` / `data-i18n-attr`, and `t()` wraps `chrome.i18n.getMessage` for dynamic strings. Add a locale by dropping in `_locales/<lang>/messages.json`. (Pluralized count strings like the per-tab stats stay English — Chrome i18n has no plural rules.)
- `src/styles.css` → `popup.css` — Tailwind v4 source and compiled output.

Built with vanilla JS (ES modules) and Tailwind v4. No runtime dependencies.

## Safari & Firefox

A shared `build.mjs` at the repo root emits per-target builds under `dist/<target>/`:

```bash
node ../build.mjs safari refresher    # → dist/safari/refresher
node ../build.mjs firefox refresher   # → dist/firefox/refresher
```

See [`../SAFARI.md`](../SAFARI.md) for the full packaging/signing flow. Refresher-specific notes:

- **Safari** — the countdown badge **text** shows, but the badge **colors** (blue background / white text) may be ignored; Safari styles badges its own way. The color setters are guarded so the text still appears. No build-time change.
- **Firefox** — the background becomes an event page (the build converts `service_worker` → `background.scripts`, keeping `type: module`), so all background listeners must be registered at the top level. They are: `runtime.onMessage`, `alarms.onAlarm`, `tabs.onRemoved`, `tabs.onUpdated`, and `runtime.onStartup`/`onInstalled` are all top-level in `background.js`.
