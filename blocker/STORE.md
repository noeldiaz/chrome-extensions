# Chrome Web Store submission — Blocker

Paste-ready copy for the Web Store developer dashboard. Not shipped in the zip.

---

## Store listing

**Item name**

```
Blocker
```

**Summary** (short description, ≤132 chars)

```
Allow only the sites you choose and block navigation to everything else. One-click on/off, syncable allowlist. No data collected.
```

**Category**

```
Productivity / Tools
```

**Detailed description**

```
Blocker turns your browser into an allowlist: pick the sites you want reachable
and everything else is blocked. Great for focus sessions, kiosks, shared
computers, or keeping yourself on task.

FEATURES
• One-click blocking — start from the popup and the tab you're on is allowed
  automatically, so you never lock yourself out. A red ON badge shows when active.
• Allow by base domain — allowing example.com allows every subdomain (www, app, …).
  Add the current tab with a button, or type any domain by hand.
• Friendly block page — disallowed sites land on a plain warning with a single
  Go back action — not a cryptic browser error, and no shortcut to disable.
• Unlock PIN — set a PIN when you start blocking; stopping requires it, so it
  can't be turned off on impulse. While blocking, the allowlist and Options lock.
• Sweeps open tabs — turning blocking on also handles tabs you already had open.
• Sync across devices (optional) — roam your allowlist through your own browser
  account. Off by default; whether blocking is on stays per-device.
• Backup & restore — export all your settings and data to a JSON file and import
  it on another machine. Importing replaces what's on the device.
• Exam-kiosk / managed mode — on machines you manage, an administrator can push a
  locked allowlist and force blocking on via Chrome policy; the student then can't
  edit the list, stop blocking, or open Options.
• Asks for access only when you start — not at install.
• Dark and light themes that follow your system preference.

PRIVACY
Blocker collects no data. By default everything is stored locally and the
extension sends nothing anywhere. No analytics, no tracking, no network requests
of its own. The pages you navigate to are checked in-browser only to decide
allow/block and are never stored or transmitted. An optional "Sync across devices"
toggle (off by default) lets the browser roam just your allowlist through your own
browser account; the data still never goes to the developer.
```

---

## Privacy practices

**Single purpose**

```
Blocker blocks navigation to any website that is not on a user-defined allowlist.
```

**Permission justifications**

| Permission | Justification |
|------------|---------------|
| `storage` | Saves the user's allowlist, the blocking on/off state, and theme preference locally so they persist between sessions. Also covers the optional account-synced storage used when the user enables "Sync across devices," which roams only the allowlist via `chrome.storage.sync`. |
| `tabs` | Reads the active tab's URL/title so the user can allow it with one click, and redirects already-open disallowed tabs to the block page when blocking is turned on. |
| `webNavigation` | Observes top-level navigations so a destination that isn't on the allowlist can be intercepted and replaced with the block page. |
| Host permissions (`http://*/*`, `https://*/*`, optional) | The `webNavigation` API only delivers navigation events for hosts the extension can access. Declared as an optional permission, requested at runtime only when the user first starts blocking. Not requested at install. |

**Are you using remote code?** No — all code is bundled in the package.

**Data usage** — declare that the extension does **not** collect or use any of the
listed data types. The navigated URLs are evaluated in-browser only to make the
allow/block decision and are never collected. `chrome.storage.local` is not
off-device collection; the optional `chrome.storage.sync` (used only if the user
enables "Sync across devices") roams the allowlist through the user's own browser
account, not to the developer, so it is likewise not developer collection. Certify
all three: not sold to third parties; not used or transferred for purposes
unrelated to the single purpose; not used to determine creditworthiness / lending.

**Privacy policy URL**

```
https://github.com/noeldiaz/chrome-extensions/blob/main/blocker/PRIVACY.md
```

---

## Assets to produce (not text — you create these)

- [ ] **Screenshots** — 1–5 at 1280×800 (or 640×400). Suggested: Control tab with blocking on; the Allowed list; the block page.
- [ ] **Store icon** — 128×128 (already in `icons/icon128.png`).
- [ ] **Small promo tile** — 440×280 (optional, improves placement).
- [ ] **Marquee** — 1400×560 (optional).

## Pre-submit checklist

- [ ] Bump `manifest.json` version if changed since last upload.
- [ ] `npm run lint && npm test` clean.
- [ ] `npm run build:css` then rebuild `blocker.zip` (runtime files only — see README).
- [ ] Confirm the zip excludes `src/`, `node_modules/`, `test/`, `eslint.config.js`,
      `scripts/`, `icons/icon512.png`.
- [ ] Load the zip's contents unpacked once more and smoke-test before uploading.
- [ ] Tag the release: `git tag blocker-v<version> && git push --tags`.
