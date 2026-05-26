# Changelog

All notable changes to Blocker are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

## [0.4.0] — 2026-05-25

### Added
- **Exam-kiosk / managed deployment.** Blocker now reads admin policy from
  `chrome.storage.managed` (Windows registry / GPO): `allowedSites` (a locked
  allowlist), `forceBlocking` (always on, no stopping), and `lockAllowlist` (the
  student can't add/remove). Admin sites show as locked rows in the popup.
- **Admin policy kit** under `enterprise/`: a Chrome registry template
  (force-install, incognito off, DevTools off, guest/profile off, URL
  allow/blocklist), an extension managed-config template, and `KIOSK.md` with a
  step-by-step Windows deployment guide and an honest list of residual risks.
- **Incognito-window guard:** while blocking, incognito windows are closed (the
  recommended setup also disables incognito by policy).

### Note
- A standalone extension cannot be exam-proof; the bulletproof enforcement is the
  enterprise policy layer. See `enterprise/KIOSK.md`.

## [0.3.0] — 2026-05-25

### Added
- **Unlock PIN.** Starting blocking now prompts a numeric keypad to set a
  4-digit PIN (entered, then confirmed). Stopping blocking requires that PIN, so
  it cannot be turned off on impulse. The PIN is stored hashed (SHA-256) in
  local storage only and is cleared once blocking is stopped.
- **Allowed-tab count pill** showing how many sites are on the allowlist.

### Changed
- **Simplified block page** to a plain warning with a single **Go back** action.
  Removed the blocked-address field and the Allow this site / Stop blocking
  buttons, so the page can no longer be used to disable blocking.
- **Locked down while blocking.** The allowlist becomes read-only (no Add,
  Remove, or Clear all) and the Options page is locked behind a notice — both so
  the protection can't be loosened without stopping blocking first (PIN). This
  also closes Import as a way to reset the blocking state.
- **Popup tidied:** removed the on/off status banner, hid the "allow this tab"
  card while blocking, and made the allow-this-tab control an icon-only button.

### Fixed
- The PIN keypad now grows the popup window so the whole pad shows with padding.

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
