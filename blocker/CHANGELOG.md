# Changelog

All notable changes to Blocker are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-05-25

### Added
- **Backup & restore** in Options → Settings: export all your settings and data
  to a JSON file, or import one to restore them on another machine. Imports are
  confirmed first and replace what is currently on the device.

## [0.1.0] — 2026-05-25

### Added
- Initial release: an allowlist-based navigation blocker.
  - **Start/stop blocking** from the popup; the active tab is auto-allowed and a
    red **ON** badge shows while blocking.
  - **Allowlist by base domain** — allowing a site allows all its subdomains;
    add the current tab with one button or type a domain manually.
  - **Custom block page** with Allow this site / Go back / Stop blocking.
  - **Open-tab sweep** when blocking turns on.
  - **Two-tab popup** (Control / Allowed) and an Options page (Settings / About).
  - **Sync across devices** (opt-in) for the allowlist; the blocking switch stays
    per-device.
  - **Opt-in host access** requested only on first start (not at install).
  - English (US) `_locales` baseline, dark/light theme, and Safari/Firefox build
    targets via the shared `build.mjs`.
