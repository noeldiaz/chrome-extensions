# Blocker

Allow only the sites you choose and block navigation to everything else.
Manifest V3.

## Features

- **One-click blocking** — start blocking from the popup; the tab you're on is auto-allowed so you don't lock yourself out. A red **ON** badge shows when it's active.
- **Unlock PIN** — when you start blocking, a numeric keypad has you set a PIN (length configurable 4–8 digits in Options). Stopping blocking later requires that PIN, so it's harder to give in on impulse. The PIN is stored hashed and only on this device.
- **Master PIN** — set an override PIN ahead of time in Options that *always* stops blocking, in case someone locks the extension with a PIN you don't know. The stop keypad accepts either the session PIN or the master PIN. Stored hashed, local only.
- **Exam-kiosk / managed mode** — on machines you manage, an administrator can push a locked allowlist and force blocking on via Chrome policy (`chrome.storage.managed`); the student then can't add/remove sites, stop blocking, or open Options. See [`enterprise/KIOSK.md`](enterprise/KIOSK.md).
- **Allowlist by base domain — or a path** — allowing `example.com` allows every subdomain (`www.`, `app.`, …). You can also scope to a path: `example.com/exam` permits only `/exam` and below. Add the current tab with one button, or type any domain/pattern manually.
- **Timed sessions** — pick a duration (15–120 min) when you start; blocking ends automatically at expiry (no PIN needed at the end). A live countdown shows the time left. "Until I stop" disables the timer.
- **Activity log + export** — a read-only **Log** tab in Options merges a session audit trail (blocking started/stopped — and whether the session or master PIN unlocked it — and timed-session expiry) with the off-limits sites that were blocked (host + time), newest first, for a proctor to review. Export it to CSV; local only; clearable.
- **Bulk add** — paste many sites at once in the Allowed tab (one per line or comma-separated); invalid entries are reported and skipped.
- **Generate admin policy** — one button in the Allowed tab emits a Windows `.reg` built from the current allowlist (native `URLAllowlist` + Blocker's managed config for the running extension id), so admins don't hand-maintain the kiosk policy.
- **Custom block page** — disallowed navigations land on a plain warning page (not a raw browser error) with a single **Go back** action; there's no shortcut to disable blocking from it. The message is editable in Options (Settings → Block page message), and an administrator can lock a `blockMessage` via managed policy.
- **Sweeps open tabs** — turning blocking on sends already-open disallowed tabs to the block page, not just future navigations.
- **Two-tab popup** — *Control* (start/stop + allow this tab + session timer) and *Allowed* (manage the list). Options has its own tabs: *Settings*, *Allowed* (full add/remove), *Log*, and *About*.
- **Sync across devices** *(opt-in)* — a toggle in Options syncs your allowlist across the devices you're signed in to. Whether blocking is on stays local to each device. Off by default.
- **Backup & restore** — export all your settings and data to a JSON file, or import one to restore them on another machine (Options → Backup & restore). Imports are confirmed first and replace what's on the device.
- **Opt-in host access** — Blocker asks for permission to watch your navigations only the first time you start blocking, not at install.
- **Dark / light theme** — slate palette, follows OS preference, manual toggle.

## How it works

Blocking is enforced in **two layers**:

1. **Network layer (`declarativeNetRequest`)** — the primary gate. While
   blocking, dynamic DNR rules redirect every disallowed top-frame http/https
   request to `blocked.html` *before the page loads*, and hard-block disallowed
   iframes. Each allowed site/path is a higher-priority `allow` rule that lets it
   through. This runs in the browser's network stack — no service-worker wake
   race — and the rules persist across restarts, so the lockdown holds even
   before the worker spins up.
2. **Service-worker backstop (`chrome.webNavigation.onBeforeNavigate`)** — a
   second check that redirects anything the first layer missed, sweeps
   already-open tabs when blocking turns on (DNR only affects new requests), and
   is the gate for `data:` URLs (arbitrary HTML/JS with no prior page load —
   DNR's http(s) rules don't see them).

Non-web pages (the New Tab page, `chrome://`, extension pages, local files) are
never touched. The block page is reached by redirect, so it's declared in
`web_accessible_resources`.

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Persist the allowlist, the blocking on/off switch, and theme; sync the allowlist across devices when the Sync toggle is on. |
| `tabs` | Read the active tab's URL/title (to allow it) and redirect disallowed tabs to the block page. |
| `webNavigation` | Observe top-level navigations so disallowed ones can be intercepted (the backstop layer). |
| `declarativeNetRequest` | Block/redirect disallowed navigations at the network layer, before the page loads (the primary layer). |
| `optional_host_permissions` (`http`/`https`) | Requested **only** when you first start blocking — `webNavigation` only delivers events, and DNR `redirect` only acts, for hosts you've granted. |

No network requests of its own. State is stored locally via
`chrome.storage.local`; with the **Sync across devices** toggle on, the allowlist
is held in `chrome.storage.sync` (roamed by the browser to your account). The
blocking switch always stays local.

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
npm run build:css && zip -r blocker.zip \
  manifest.json popup.html popup.css popup.js options.html options.js \
  blocked.html blocked.js background.js lib.js psl-data.js i18n.js sync.js dialog.js backup.js pinpad.js pin.js audit.js \
  _locales \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
```

Excludes source/tooling (`src/`, `node_modules/`, `eslint.config.js`, `test/`, `scripts/`, `icons/icon512.png`).

> **Icon:** a 1:1 recolor of `scripts/stop-hand-source.png` (a red stop-sign-hand)
> to our blue `#1e88e5`, outside made transparent. Regenerate with
> `python3 scripts/recolor-icon.py` (needs Pillow). There is no `icon.svg` — the
> artwork is raster-sourced, so the trace is pixel-exact.

## Architecture

- `background.js` — service worker (`type: module`): pushes the `declarativeNetRequest` dynamic rules that enforce the allowlist at the network layer (built in `lib.js`), watches `webNavigation` as a backstop, decides via `lib.js`, redirects disallowed tabs to `blocked.html`, manages the badge, and sweeps open tabs when blocking turns on.
- `popup.js` / `popup.html` — *Control* tab (start/stop, allow this tab, status) and *Allowed* tab (add/remove/clear the allowlist), plus theme.
- `blocked.js` / `blocked.html` — the block page: a plain warning with a single Go back action (no way to disable blocking from here).
- `pinpad.js` — promise-based numeric PIN-pad modal used in the popup to set the unlock PIN when blocking starts and to require it before stopping.
- `options.js` / `options.html` — options page: the **Sync across devices** toggle, a "How blocking works" note, About panel, theme.
- `sync.js` — opt-in cross-device sync. A `syncEnabled` flag in `chrome.storage.local` selects the active area (`sync` when on, else `local`) for the `allowed` list; toggling migrates it between areas. The blocking switch always uses `chrome.storage.local`.
- `lib.js` — pure helpers (URL/host parsing, base-domain reduction, allow matching, the block decision, and the `declarativeNetRequest` rule builder), shared by popup/background/blocked and unit-tested.
- `dialog.js` — minimal promise-based confirm modal used before removing or clearing allowlist entries, and before restoring a backup.
- `backup.js` — settings/data export & import: bundles every `chrome.storage` key into a tagged JSON file and restores it (used by the Options → Backup & restore controls).
- `i18n.js` / `_locales/` — localization. `_locales/en/messages.json` is the catalog; `localize()` applies it via `data-i18n` / `data-i18n-attr`, and `t()` wraps `chrome.i18n.getMessage`. Add a locale by dropping in `_locales/<lang>/messages.json`.
- `src/styles.css` → `popup.css` — Tailwind v4 source and compiled output.

Built with vanilla JS (ES modules) and Tailwind v4. No runtime dependencies.

> **Base-domain note:** the eTLD+1 reduction uses the full **Public Suffix List**
> (ICANN section), vendored in `psl-data.js` with wildcard (`*.ck`) and exception
> (`!www.ck`) rules handled per the PSL algorithm in `lib.js`. Refresh it with
> `node scripts/gen-psl.mjs` (fetches the upstream list; the generated file is
> committed so the build needs no network).

## Exam kiosk / managed deployment

On machines you control (e.g. school exam laptops), Blocker can run as a locked
kiosk. **An extension alone is not exam-proof** — a student owns the browser and
can use incognito, disable the extension, switch profiles, or edit storage via
DevTools. The lockdown is only hard to escape when paired with **Chrome enterprise
policy**, which on Windows comes from the registry and needs **no Google
subscription**.

Two registry templates and a full guide live in [`enterprise/`](enterprise/):

- `chrome-kiosk.reg` — force-installs Blocker (can't be removed), disables
  incognito + DevTools + guest/extra profiles, and sets a native
  `URLAllowlist`/`URLBlocklist`.
- `blocker-managed.reg` — pushes the extension's `chrome.storage.managed` config:
  `allowedSites` (locked list), `forceBlocking` (always on, no stopping),
  `lockAllowlist` (student can't edit). Schema: [`schema.json`](schema.json).
- `KIOSK.md` — step-by-step deployment and an honest list of residual risks.

When `forceBlocking` is set, the popup shows **Locked by administrator**, the
allowlist is read-only with admin sites shown as locked rows, and Options is
inaccessible.

## Edge, Safari & Firefox

A shared `build.mjs` at the repo root emits per-target builds under `dist/<target>/`:

```bash
node ../build.mjs edge blocker      # → dist/edge/blocker
node ../build.mjs safari blocker    # → dist/safari/blocker
node ../build.mjs firefox blocker   # → dist/firefox/blocker
```

- **Edge** — Edge is Chromium, so it runs the Chrome build unchanged; the `edge`
  target is just a labelled copy of the Chrome output (`node ../build.mjs edge blocker`).
  Load it from `edge://extensions` the same way.

See [`../SAFARI.md`](../SAFARI.md) for the full packaging/signing flow. Blocker-specific notes:

- **No offscreen/downloads** — Blocker uses neither, so nothing is feature-gated; the same source ships to every target. The red **ON** badge text shows everywhere; the badge color may be ignored on Safari (it styles badges its own way).
- **declarativeNetRequest** — the primary blocking layer. `applyDnr()` guards on `chrome.declarativeNetRequest?.updateDynamicRules`, so on any engine where DNR dynamic rules are missing or differ (older Safari/Firefox), it no-ops and the `webNavigation` backstop carries enforcement on its own. Verify the DNR path actually fires on Safari/Firefox before relying on the pre-load guarantees there.
- **Firefox** — the background becomes an event page (the build converts `service_worker` → `background.scripts`, keeping `type: module`), so all background listeners are registered at the top level. They are: `webNavigation.onBeforeNavigate`, `storage.onChanged`, and `runtime.onStartup`/`onInstalled`. Host access must be granted in Firefox's add-on permissions for navigation events to arrive (and for DNR `redirect` rules to act).
- **Not yet load-tested** on Safari/Firefox — verify in `about:debugging` (Firefox) / the Safari Web Extension converter before relying on it.
