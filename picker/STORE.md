# Chrome Web Store submission — Picker

Paste-ready copy for the Web Store developer dashboard. Not shipped in the zip.

---

## Store listing

**Item name**

```
Picker
```

**Summary** (short description, ≤132 chars)

```
Eyedropper color picker: sample any pixel, copy HEX/RGB/HSL/OKLCH + nearest Tailwind, shades, harmonies, contrast, gradients.
```

**Category**

```
Developer Tools
```

**Detailed description**

```
Picker is a color toolkit in your toolbar. Sample any pixel on screen with the
native eyedropper, then read, convert, and copy the color in whatever form you
need — no app switching, no network.

PICK & COPY
• Screen eyedropper — sample any pixel anywhere on screen (Chromium 95+). Where
  the eyedropper isn't available (Safari, Firefox), a native color box takes over.
• Formats — HEX, RGB, HSL, HSV, OKLCH, RGBA, HSLA, 8-digit HEX, and the nearest
  Tailwind color (OKLab match, e.g. blue-600). Click any pill to copy.
• Code — the color as a developer literal: CSS custom property, SwiftUI Color,
  UIKit UIColor, Android 0xFF…, Flutter Color(0xFF…), and a Unity float triplet.

EXPLORE & ADJUST
• Shades — a 50–950 OKLCH tint/shade ramp, with the step nearest your color marked.
• Adjust — fine-tune with H/S/L sliders; everything re-renders live.
• Harmonies — complementary, analogous, triadic, split, and tetradic schemes;
  click any swatch to load it.
• Gradient builder — linear / radial / conic gradients from 2–5 stops; copy the CSS.
• Export — emit the shade ramp or a harmony as CSS custom properties, a Tailwind
  config object, or JSON.

ACCESSIBILITY
• Contrast checker — WCAG ratio + AA/AAA for normal/large text, plus a perceptual
  APCA Lc reading. When the pick fails AA, it suggests the nearest accessible shade.
• Color Vision — preview the color as seen with protanopia, deuteranopia, and
  tritanopia (Machado 2009).

WORKFLOW
• Page colors — scan the current tab and list its most-used colors.
• Favorites — save named colors; rename, remove, JSON export/import.
• Recent colors — your last 12 picks, restored on open.
• Backup & restore — export all your settings and data to a JSON file and import
  it on another machine. Importing replaces what's on the device.
• Dark mode and a keyboard shortcut (Alt+Shift+P, rebindable).

PRIVACY
Picker collects no data and makes no network requests of its own. Everything is
stored locally in your browser. An optional "Sync across devices" toggle (off by
default) lets the browser roam your settings, favorites, and recent colors through
your own browser account; that sync is done by the browser, and the data still
never reaches the developer.
```

---

## Privacy practices

**Single purpose**

```
Picker samples a color from the user's screen (or a chosen color value), and
displays, converts, and copies it in standard color formats — along with related
color tools (shades, harmonies, gradients, contrast, and color-vision preview).
```

**Permission justifications**

| Permission | Justification |
|------------|---------------|
| `storage` | Stores the user's recent colors, favorites, value-format and copy-on-pick settings, HEX letter-case, and theme preference locally so they persist between sessions. Also covers the optional account-synced storage used when the user enables "Sync across devices," which roams those preferences via `chrome.storage.sync`. |
| `activeTab` | Lets the user run "Scan this page" on the tab they're viewing, only when they click it. Grants temporary access to the active tab without broad install-time host access. |
| `scripting` | Injects a one-shot function into the active tab to read its colors from elements' computed styles for the Page tab's color scan. Reads color values only; injected only on the user's explicit "Scan this page" click. |

No host permissions are declared. The on-screen eyedropper uses the browser's
built-in `EyeDropper` API, which needs no permission and samples pixels locally.

**Are you using remote code?** No — all code is bundled in the package.

**Data usage** — declare that the extension does **not** collect or use any of
the listed data types. `chrome.storage.local` is not off-device collection; the
optional `chrome.storage.sync` (used only if the user enables "Sync across
devices") roams preferences through the user's own browser account, not to the
developer, so it is likewise not developer collection. The page-color scan reads
computed style colors locally and sends them nowhere. Certify all three: not sold
to third parties; not used or transferred for purposes unrelated to the single
purpose; not used to determine creditworthiness / lending.

**Privacy policy URL**

```
https://github.com/noeldiaz/chrome-extensions/blob/main/picker/PRIVACY.md
```

---

## Assets to produce (not text — you create these)

- [ ] **Screenshots** — 1–5 at 1280×800 (or 640×400). Suggested: the popup's
      Color tab with formats + shades in light mode; same in dark mode; the Tools
      tab showing the contrast checker + APCA; the Page tab's scanned colors.
- [ ] **Store icon** — 128×128 (already in `icons/icon128.png`).
- [ ] **Small promo tile** — 440×280 (optional, improves placement).
- [ ] **Marquee** — 1400×560 (optional).

## Pre-submit checklist

- [ ] Bump `manifest.json` version if changed since last upload.
- [ ] `npm run lint && npm test` clean.
- [ ] `npm run build:css`, then build `picker.zip` (runtime files only).
- [ ] Confirm the zip **includes** `manifest.json`, `popup.html`, `popup.js`,
      `popup.css`, `options.html`, `options.js`, `lib.js`, `palette.js`,
      `theme.js`, `i18n.js`, `sync.js`, `dialog.js`, `_locales/`, and
      `icons/icon{16,32,48,128}.png`; and **excludes** `src/`, `node_modules/`,
      `test/`, `scripts/`, `eslint.config.js`, `icon.svg`,
      `icons/icon512.png`, `*.md`, `package*.json`.
- [ ] Load the zip's contents unpacked once more and smoke-test pick → copy,
      shades, contrast, page scan, favorites, and sync before uploading.
- [ ] Tag the release: `git tag picker-v<version> && git push --tags`.
```

