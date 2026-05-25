# Changelog

All notable changes to Picker are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

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
