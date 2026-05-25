# Changelog

All notable changes to QRmaker are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

## [0.8.0] — 2026-05-25

### Added
- **Backup & restore** in Options → Settings: export everything — settings, saved
  center logos, and created-code history — to a JSON file, or import one to
  restore it on another machine. Imports are confirmed first and replace what is
  currently on the device.

## [0.7.0] — 2026-05-25

### Added
- **Firefox support** — a `firefox` build target (`node build.mjs firefox
  qrmaker`); the background is packaged as an event page (no service worker).

### Changed
- README, privacy policy, and store copy clarified for the opt-in Sync feature.

### Removed
- Orphaned `optionsBlank` message key (the Settings tab now hosts the Sync toggle).

## [0.6.0] — 2026-05-25

### Added
- **Sync across devices** (opt-in) — a Settings toggle keeps your saved style
  presets in sync via the browser's account sync. Off by default; the popup
  live-updates when another device changes them.

## [0.5.0] — 2026-05-25

### Added
- **Glossy blue tile icon** — top-lit blue gradient with a glassy top sheen;
  the white QR gains a soft drop shadow so it reads as printed/raised,
  filling the canvas edge-to-edge.
- **Internationalization** — English (US) baseline via `_locales`.
- **Options page** with a settings gear and a Close control.
- **Tabbed options page** — Settings / About, with a sticky header (logo +
  title left; theme toggle and Close right).
- Editor config gear, a Save-to-history button, and a sticky layout.

### Changed
- Structured-aware decode — scanned codes reopen in the form of their type
  (URL, vCard, geo, etc.).

## [0.4.0] — 2026-05-24

### Added
- Structured-aware decode groundwork and assorted type handling.

## [0.3.0] — 2026-05-23

### Added
- "Use my location" button for the geo type.
- Structured address and note fields for vCard.
- Drag/paste to scan, plus a "More types" shortcut in the popup.

## [0.2.0] — 2026-05-23

### Added
- Download/copy of the generated code, an options card, and a styled
  rendering engine.

## [0.1.0] — 2026-05-23

### Added
- Initial release: generate a QR code for the active tab's URL.
