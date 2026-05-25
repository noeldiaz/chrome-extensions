# Changelog

All notable changes to Screener are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

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
