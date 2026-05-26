# Chrome Web Store submission — Refresher

Paste-ready copy for the Web Store developer dashboard. Not shipped in the zip.

---

## Store listing

**Item name**

```
Refresher
```

**Summary** (short description, ≤132 chars)

```
Auto-refresh chosen tabs on intervals you set. Multi-tab, live countdown, optional scroll preservation. No data collected.
```

**Category**

```
Productivity / Tools
```

**Detailed description**

```
Refresher reloads the browser tabs you choose on a schedule you control — perfect
for dashboards, build monitors, auctions, sports scores, or any page you want kept
fresh without touching it.

FEATURES
• Multiple tabs — refresh several tabs at once, each on its own interval.
• Live countdown — the toolbar badge shows the time to the next refresh for a single
  tab, or the number of tabs being refreshed when you have more than one.
• Preset intervals — 30s, 1m, 2m, 5m, 10m, 15m, or any custom minutes/seconds.
• Scroll preservation (optional) — returns the page to where you were after each
  reload. Off by default; turning it on asks for the access it needs.
• Per-tab stats — see how many times each tab has refreshed and when it last did.
• Skips tabs playing audio, so a refresh never interrupts a video or call.
• Backup & restore — export all your settings and data to a JSON file and import
  it on another machine. Importing replaces what's on the device.
• Dark and light themes that follow your system preference.

PRIVACY
Refresher collects no data. By default everything is stored locally in your browser
and the extension sends nothing anywhere. No analytics, no tracking, no network
requests of its own. An optional "Sync across devices" toggle (off by default) lets
the browser roam just your refresh defaults — interval and scroll preservation —
through your own browser account; the data still never goes to the developer.
```

---

## Privacy practices

**Single purpose**

```
Refresher automatically reloads the browser tabs a user chooses, on a periodic
interval the user sets.
```

**Permission justifications**

| Permission | Justification |
|------------|---------------|
| `storage` | Saves the user's selected tabs, refresh intervals, per-tab statistics, and theme preference locally so they persist between browser sessions. Also covers the optional account-synced storage used when the user enables "Sync across devices," which roams only the refresh defaults (interval and scroll preservation) via `chrome.storage.sync`. |
| `alarms` | Schedules the periodic reloads at the user-chosen interval. Chrome's periodic alarm minimum is 30 seconds. |
| `tabs` | Reloads the specific tabs the user selected (by tab id) and reads their titles to show which tabs are being refreshed and keep that label current after the page navigates. |
| `scripting` | Reads and restores the page's scroll position around a reload. Used only when the optional "Preserve scroll position" setting is enabled. |
| Host permissions (`http://*/*`, `https://*/*`, optional) | Lets the scroll-preservation script read/set `window.scroll` on the refreshed page. Declared as an optional permission, requested at runtime only when the user enables scroll preservation, and removed when they disable it. Not requested at install. |

**Are you using remote code?** No — all code is bundled in the package.

**Data usage** — declare that the extension does **not** collect or use any of the
listed data types. `chrome.storage.local` is not off-device collection; the
optional `chrome.storage.sync` (used only if the user enables "Sync across
devices") roams the refresh defaults through the user's own browser account, not
to the developer, so it is likewise not developer collection. Certify all three:
not sold to third parties; not used or transferred for purposes unrelated to the
single purpose; not used to determine creditworthiness / lending.

**Privacy policy URL**

```
https://github.com/noeldiaz/chrome-extensions/blob/main/refresher/PRIVACY.md
```

---

## Assets

Built with `node tools/shoot-store.mjs refresher` (frames raw `screenshots/`
grabs onto the brand canvas + builds the marquee). Source grabs live in
`refresher/screenshots/`; finished assets in `refresher/store/`.

- [x] **Screenshots** — 4 at 1280×800 in `store/screenshots/`: popup over a real
      page (light), options (Sync + Backup), active tab with live countdown badge,
      and dark mode.
- [x] **Store icon** — 128×128 (`icons/icon128.png`).
- [x] **Marquee** — 1400×560 (`store/marquee.png`).
- [ ] **Small promo tile** — 440×280 (optional, improves placement). Not yet made.

## Pre-submit checklist

- [ ] Bump `manifest.json` version if changed since last upload.
- [ ] `npm run lint && npm test` clean.
- [ ] `npm run build:css` then rebuild `refresher.zip` (runtime files only — see README).
- [ ] Confirm the zip excludes `src/`, `node_modules/`, `test/`, `eslint.config.js`,
      `icon.svg`, `icons/icon512.png`.
- [ ] Load the zip's contents unpacked once more and smoke-test before uploading.
- [ ] Tag the release: `git tag refresher-v<version> && git push --tags`.
