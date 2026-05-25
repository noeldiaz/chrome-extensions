# Chrome Web Store submission — Screener

Paste-ready copy for the Web Store developer dashboard. Not shipped in the zip.

---

## Store listing

**Item name**

```
Screener
```

**Summary** (short description, ≤132 chars)

```
Capture a tab, region, full page, or screen. Annotate and redact, then download, copy, or submit it as a support ticket.
```

**Category**

```
Productivity / Tools
```

**Detailed description**

```
Screener turns a screenshot into a finished support ticket in one flow: capture,
mark it up, and send it.

CAPTURE
• Visible area — exactly what's on screen now.
• Selected area — drag to grab just the region you want.
• Full page — scrolls top to bottom and stitches it into one tall image.
• Full screen — a whole monitor or a single window.

ANNOTATE
• Rectangles, arrows, freehand pen, and text.
• Redact — drop a solid block over anything sensitive before you share it.
• Move, resize, delete, undo/redo. Pick colors and stroke width.

SEND
• Download as a PNG.
• Copy straight to the clipboard.
• Submit ticket — fill in a title and description and post it to your own
  support endpoint (a URL and token you set in Options).

SETTINGS
• Backup & restore — export all your settings to a JSON file and import it on
  another machine. Importing replaces what's on the device.

PRIVACY
Screener has no server of its own. Download and Copy are fully local. It only
makes a network request when you click Submit, and only to the endpoint you
configured. No analytics, no tracking, nothing sent to the developer. An optional
"Sync across devices" toggle (off by default) lets the browser roam just your
endpoint URL and token through your own browser account; that sync is done by the
browser, and the data still never reaches the developer.
```

---

## Privacy practices

**Single purpose**

```
Screener captures a screenshot of the user's tab, a selected region, a full page,
or a screen; lets the user annotate it; and outputs it by download, clipboard, or
submission to an endpoint the user configures.
```

**Permission justifications**

| Permission | Justification |
|------------|---------------|
| `activeTab` | Capture the active tab's visible area, a selected region, or the full page when the user invokes a capture. Avoids broad install-time host access. |
| `scripting` | Inject the drag-to-select overlay and the scroll/measure helpers used for region and full-page capture into the active tab. |
| `offscreen` | Full-screen capture uses `getDisplayMedia`, which requires a DOM document; the Manifest V3 service worker has none, so it runs in an offscreen document. |
| `downloads` | Save the finished screenshot as a PNG file. |
| `clipboardWrite` | Copy the finished screenshot to the system clipboard. |
| `storage` | Store the user's ticket endpoint URL, bearer token, and theme preference locally. Also covers the optional account-synced storage used when the user enables "Sync across devices," which roams the endpoint URL and bearer token via `chrome.storage.sync`. |
| Host permissions (`http://*/*`, `https://*/*`, optional) | Send a submitted ticket to the user-configured endpoint. Declared optional and requested at runtime only when the user first submits, scoped to that endpoint's origin. Not requested at install. |

**Are you using remote code?** No — all code, including the bundled Konva
library (`vendor/konva.min.js`), ships in the package.

**Data usage** — Screener does not collect data for the developer. It transmits
user-authored content (the screenshot and the title/description) **only** to the
first-party endpoint the user configures, and **only** on the explicit Submit
action. If the user enables the optional "Sync across devices," the endpoint URL
and bearer token are roamed through the user's own browser account via
`chrome.storage.sync` — done by the browser, not sent to the developer, so it is
not developer collection. Disclose the Submit flow honestly on the data form: the
item handles/transfers "Website content" (screenshots may contain page content)
at the user's direction to the user's own server. Certify: not sold to third
parties; not used for purposes unrelated to the single purpose; not used for
creditworthiness/lending.

**Privacy policy URL**

```
https://github.com/noeldiaz/chrome-extensions/blob/main/screener/PRIVACY.md
```

---

## Assets to produce (not text — you create these)

- [ ] **Screenshots** — 1–5 at 1280×800 (or 640×400). Suggested: the popup's
      capture menu; the editor with an annotated image (arrow + redact); the
      Options page; a full-page capture.
- [ ] **Store icon** — 128×128 (already in `icons/icon128.png`).
- [ ] **Small promo tile** — 440×280 (optional, improves placement).
- [ ] **Marquee** — 1400×560 (optional).

## Pre-submit checklist

- [ ] Bump `manifest.json` version if changed since last upload.
- [ ] `npm run lint && npm test` clean.
- [ ] `npm run build:css`, then build `screener.zip` (runtime files only — see README).
- [ ] Confirm the zip **includes** `vendor/konva.min.js` and **excludes** `src/`,
      `node_modules/`, `test/`, `eslint.config.js`, `icon.svg`,
      `icons/icon512.png`, `*.md`, `package*.json`.
- [ ] Load the zip's contents unpacked once more and smoke-test all four capture
      modes + annotate + each output before uploading.
- [ ] Tag the release: `git tag screener-v<version> && git push --tags`.
