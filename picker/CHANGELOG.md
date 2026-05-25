# Changelog

All notable changes to Picker are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

## [0.8.1] — 2026-05-25

### Changed
- Broadened the extension description (manifest + About card) to reflect the full
  toolkit — format conversion, nearest-Tailwind match, shades, harmonies,
  contrast, and gradients — rather than just HEX/RGB/HSL.

### Added
- `STORE.md` — Chrome Web Store listing copy, single-purpose statement, and
  permission justifications (`storage`, `activeTab`, `scripting`).
- README note that the Chromium `edge` build target runs the Chrome build
  unchanged, with `EyeDropper` supported (`node build.mjs edge picker`).

## [0.8.0] — 2026-05-25

### Added
- **Firefox support** — a `firefox` build target (`node build.mjs firefox picker`)
  produces a Firefox 121+ package; `EyeDropper` is unavailable there, so the
  native color box takes over (as on Safari).

### Changed
- README rewritten to cover the full current feature set (Adjust, Harmonies,
  Code, Color Vision, Gradient, APCA, Export, Sync).
- Privacy policy clarified for the opt-in Sync feature.

### Removed
- Dead code: unused `GRADIENT_TYPES` export and a few orphaned message keys.

## [0.7.0] — 2026-05-25

### Added
- **Sync across devices** (opt-in) — a Settings toggle keeps your formats, HEX
  case, copy-on-pick, favorites, and recent colors in sync via the browser's
  account sync. Off by default; the popup live-updates when another device
  changes the data.

## [0.6.0] — 2026-05-25

### Added
- **Adjust** (Color tab) — H/S/L sliders to fine-tune the picked color live;
  the swatch, formats, ramp, harmonies, and contrast all update as you drag.
- **Export** (Tools tab) — copy the shade ramp or any harmony as CSS custom
  properties, a Tailwind config object, or JSON.
- **Gradient depth** — 2–5 color stops (add/remove) and linear / radial / conic
  types, alongside the existing angle control.

### Changed
- Color tab leads with Shades; Tools tab starts with Contrast collapsed and
  ends with Export then the manual color box.
- Smaller top action row and tabs to save vertical space.

## [0.5.0] — 2026-05-25

### Added
- **Harmonies** (Color tab) — complementary, analogous, triadic, split, and
  tetradic schemes off the picked color; base swatch first, click any to load.
- **Code formats** (Color tab) — copy the color as SwiftUI, UIKit, Android,
  Flutter, Unity float, or a CSS custom property.
- **Color Vision** (Tools tab) — preview the color under protanopia,
  deuteranopia, and tritanopia (Machado 2009); click a card to load it.
- **Gradient builder** (Tools tab) — start (linked to the pick), end, and an
  8-way angle → live preview and a copyable `linear-gradient(…)`.
- **APCA contrast** (Tools tab) — perceptual Lc value and tier alongside the
  WCAG ratio.
- **Accessible-shade suggestion** — when the pick fails WCAG AA against the
  chosen background, offer the nearest passing shade from its ramp.
- **Reset controls** on the Contrast and Gradient tools, shown only when their
  inputs differ from the defaults.

### Changed
- "or choose a color" row split 50/50 between the label and the color box.

### Fixed
- Color Vision cards now use a surface fill so they no longer blend into the
  popup background.

## [0.4.1] — 2026-05-25

### Changed
- Recent strip: the "More" control is now a blue accent pill with a plus
  icon, shown after the 6 most recent colors, with a wider gap between
  swatches.
- Recent Colors options tab lays its chips out in a 3-column grid that fills
  the available width.
- Shade-ramp active marker uses a lighter slate ring in light mode.

## [0.4.0] — 2026-05-25

### Added
- **Page Colors tab** — scan the current tab and list its most-used colors
  (reads computed styles via `activeTab` + `scripting`).
- **Tabbed popup** — Color / Page / Tools.
- **Tabbed options page** — Settings / Recent Colors / About, with an About
  card showing icon, name, and version.
- **Sticky header** on the options page (logo + title left, theme toggle and
  Close right).
- "More" button on the recent strip (shown past 7 colors) that deep-links to
  the Recent Colors options tab.

### Changed
- Settings reordered: Copy on pick → Favorite formats → HEX letter case.
- Favorite-format checkboxes sort checked-first.
- Shade ramp marks the nearest step with a theme-aware slate ring + step number.

### Fixed
- Recent swatches aligned with the "More" button (removed inline-block
  baseline gap).

## [0.3.0] — 2026-05-25

### Added
- More value formats (OKLCH and others) with a "Favorite Formats" / "Other
  Formats" split and per-format defaults in Settings.
- Contrast checker (WCAG ratio + AA/AAA against black and white).
- Shade/tint ramp and saved favorites, with confirmation before removal.
- Choose which format auto-copies on pick.
- Notice in Settings stating the bundled Tailwind palette version.

### Changed
- Denser popup layout; two-column format pills; click-to-copy fields with a
  visual confirm (no separate copy icon).
- American English throughout; realistic dropper Pick button.

## [0.2.0] — 2026-05-25

### Added
- Nearest Tailwind color match, HSV values, and a privacy policy.
- Improved copy UX and localization.

## [0.1.0] — 2026-05-24

### Added
- Initial release: EyeDropper popup, color values, and settings page.
