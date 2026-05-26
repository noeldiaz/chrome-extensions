# Changelog

All notable changes to Refresher are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-05-26

First stable release — initial Chrome Web Store submission.

### Added
- Chrome Web Store listing assets: four 1280×800 screenshots, a 1400×560
  marquee, and a 440×280 promo tile (built by `tools/shoot-store.mjs`), plus the
  paste-ready listing copy and permission justifications in `STORE.md`.

### Fixed
- Packaged builds no longer carry `.DS_Store` files or the unused 512px icon
  source; the `icon.svg` source is excluded too. (Runtime uses the
  16/32/48/128 PNGs.)

## [0.11.0] — 2026-05-25

### Changed
- Cross-device sync mechanism extracted to the shared `sync-core.js`; `sync.js`
  is now just the per-extension `SYNC_KEYS` config.

### Accessibility
- All pages: `lang="en"`, status region announced, decorative icons
  `aria-hidden`, and the Options tablist completed (`aria-selected` wired, panels
  labelled + focusable). The per-second countdown is deliberately not a live
  region (avoids screen-reader spam).

## [0.10.0] — 2026-05-25

### Changed
- **Confirm-dialog accessibility** (`dialog.js`): the modal is now a labelled
  dialog, moves focus into itself on open and restores it on close, and traps Tab
  focus between its buttons.

### Hardened
- **Backup import** rejects a file whose `schema` is newer than this build
  understands, instead of silently mis-restoring it.

## [0.9.0] — 2026-05-25

### Fixed
- Scroll preservation now correctly checks the granted host permission before a
  reload (an unawaited Promise was treated as always-on).
- The popup no longer hangs if the service worker is asleep: arm/stop messages
  fail gracefully, and the background message handler always responds.
- Hardened a transient reload retry and the scroll-permission cleanup against
  unhandled promise rejections.
- The per-tab countdown falls back to "--:--" instead of "NaN:NaN" on a
  malformed alarm time.

## [0.8.0] — 2026-05-25

### Added
- **Backup & restore** in Options → Settings: export all your settings and data
  to a JSON file, or import one to restore them on another machine. Imports are
  confirmed first and replace what is currently on the device.

## [0.7.0] — 2026-05-25

### Added
- **Firefox support** — a `firefox` build target (`node build.mjs firefox
  refresher`); the background is packaged as an event page (no service worker).

### Changed
- README, privacy policy, and store copy clarified for the opt-in Sync feature.

## [0.6.0] — 2026-05-25

### Added
- **Sync across devices** (opt-in) — a Settings toggle keeps your refresh
  defaults (interval and scroll preservation) in sync via the browser's account
  sync. Off by default; per-tab refresh rules stay local to each device.

## [0.5.0] — 2026-05-25

### Added
- **Two-arrow reload icon** — a true reload glyph (two point-symmetric arrows
  with integrated heads) in a top-lit blue gradient, filling the canvas.
- **Internationalization** — English (US) baseline via `_locales`.
- **Options page** with a settings gear and a Close control.
- **Tabbed options page** — Settings / About, with a sticky header (logo +
  title left; theme toggle and Close right).
- Descriptive titles and ARIA labels on the Go/Stop buttons.

### Changed
- Icons unified across the workspace — edge-to-edge, transparent corners.
- Extension icon shown to the left of the title in every window.
- Light theme tuned to match.

### Fixed
- Guarded the badge text-color setters so Safari (which lacks them) doesn't
  throw.

## [0.4.1] — 2026-05-22

### Added
- Initial workspace release: per-tab auto-refresh with live badge countdown.
