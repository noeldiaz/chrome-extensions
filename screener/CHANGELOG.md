# Changelog

All notable changes to Screener are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

## [0.4.0] — 2026-05-25

### Added
- **Numbered comment pins** — a new annotation tool: click to drop numbered
  pins (blue/white) on the capture, add an editable comment in a floating card,
  hover to preview, and pins renumber 1..N when one is removed. On export, a
  numbered legend of the comments is appended beneath the image.
- **Firefox support** — a `firefox` build target (`node build.mjs firefox
  screener`); full-screen capture is off there (no offscreen API), like Safari.
- Icons on the editor's Copy / Submit ticket / Download buttons.

### Changed
- README and privacy docs updated for the comment pins and the opt-in Sync.
- Localized the Tickets-tab copy.

### Fixed
- Renamed a shadowed `t` (i18n) binding in the annotator/editor.
- Packaging file list now includes `sync.js` and `build-config.js`.

## [0.3.0] — 2026-05-25

### Added
- **Sync across devices** (opt-in) — a Settings toggle keeps your ticket
  endpoint and token in sync via the browser's account sync. Off by default.
- **Tickets options tab** — the endpoint/token settings and the "What gets
  sent" note now live on their own tab, each in a card.

### Changed
- The editor hides the **Submit ticket** button until a ticket endpoint is
  configured (Download and Copy still work); it appears live once one is set.

## [0.2.0] — 2026-05-25

### Added
- **Photo-realistic camera icon** — graphite gradient body, brushed-metal
  lens barrel, and a blue glass lens, filling the canvas edge-to-edge.
- **Internationalization** — English (US) baseline via `_locales`.
- **Safari-aware build** — the multi-target build gates `offscreen` and
  `downloads` so the same source ships to Chrome and Safari.
- **Tabbed options page** — Settings / About, with a sticky header (logo +
  title left; theme toggle and Close right).
- **Close button** on the editor and on the options page.
- Extension icon shown to the left of the title in every window.

### Changed
- Editor: zoom/pan, pixelate redaction, a capture keyboard shortcut, and
  saved capture defaults.

### Fixed
- Audit hardening — safer downloads, error surfacing, and orphaned-capture
  cleanup.

## [0.1.0] — 2026-05-22

### Added
- Initial release: screen capture, annotation, clipboard copy, ticket
  submission, and an options page.
