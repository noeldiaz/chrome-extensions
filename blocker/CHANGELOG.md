# Changelog

All notable changes to Blocker are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

## [0.10.0] — 2026-05-25

### Added
- **Audit trail.** The Log tab is now an **Activity log**: alongside blocked
  attempts it records session events — blocking started (with the timed length),
  stopped (and whether the session or the **master** PIN unlocked it), and timed
  sessions ending. Merged into one newest-first timeline (red dot = blocked
  attempt, grey = session event).
- **Log export.** Download the activity log as CSV (time, kind, detail) for
  proctor records.
- **Bulk add.** Paste many sites at once in the Allowed tab — one per line or
  comma-separated; invalid entries are reported and skipped.
- **Generate admin policy.** One button emits a Windows `.reg` built from the
  current allowlist — the native `URLAllowlist` plus Blocker's managed
  `forceBlocking`/`lockAllowlist`/`allowedSites` for the running extension id —
  so admins don't hand-maintain the kiosk policy. (Allowed tab.)
- **Custom block-page message.** A text field in Settings (collapsed by default)
  sets the message shown on the block page; empty falls back to the default. An
  admin's managed `blockMessage` policy overrides it for locked kiosks.

## [0.9.0] — 2026-05-25

### Added
- **Network-layer enforcement (`declarativeNetRequest`).** Blocking now blocks
  disallowed navigations *before the page loads*, via dynamic DNR rules in the
  browser's network stack — no service-worker wake race, and the rules persist
  across restarts so the lockdown holds even before the worker spins up. Each
  allowed site/path becomes a higher-priority `allow` rule.
- **iframes are gated too.** Disallowed sub-frames are hard-blocked; previously
  only the top frame was checked.
- **`data:` URL bypass closed.** Top-frame `data:` navigations (arbitrary
  HTML/JS with no prior page load) are now blocked by the webNavigation layer.

### Changed
- `chrome.webNavigation` is now the **backstop** layer behind DNR: it catches
  anything the network rules miss, sweeps already-open tabs, and gates `data:`.
- The custom block page is unchanged — DNR `redirect` points top frames at it,
  so disallowed sites still land on the friendly warning, not a browser error.
- New `declarativeNetRequest` permission; `blocked.html` is now a
  `web_accessible_resource` (required as a redirect target). No new host access.

### Hardened
- Per-rule validation: each allow entry yields a condition DNR accepts (plain
  hosts use `requestDomains`; IPs/IPv6/odd hosts and path rules use a
  `regexFilter`), so one unusual entry can't make the rule update throw. If an
  update fails anyway, all dynamic rules are cleared rather than left half-applied
  (which would block approved sites too) — the webNavigation backstop then
  enforces the correct allow/block.

## [0.8.1] — 2026-05-25

### Changed
- **Master PIN is now self-protecting:** once set, changing or removing it
  requires entering the current master PIN first, so no one can quietly swap or
  clear it.
- Moved the **How blocking works** card from Settings to the About tab.

## [0.8.0] — 2026-05-25

### Added
- **Master PIN.** Options → Settings can store an override PIN ahead of time that
  always stops blocking — for when someone locks the extension with a session PIN
  you do not know. The stop keypad accepts either the session PIN or the master
  PIN (any configured length). Stored hashed (SHA-256), local only.

### Changed
- The unlock keypad now verifies as soon as enough digits are entered, so PINs of
  different lengths (session vs master) both work at the same prompt.
- PIN hashing moved to a shared `pin.js` so the popup and Options hash identically.

## [0.7.0] — 2026-05-25

### Added
- **Allowed-sites management in Options.** A new **Allowed** tab (second slot:
  Settings · Allowed · Log · About) lists the allowlist with add/remove/clear,
  mirroring the popup. Admin-pushed sites show as locked rows, and the whole tab
  is read-only when the allowlist is locked by policy.

## [0.6.0] — 2026-05-25

### Added
- **Configurable unlock-PIN length.** Options → Settings lets you choose a 4–8
  digit PIN; it applies the next time you start blocking. The active PIN keeps
  the length it was set with, so the stop prompt always expects the right count.

## [0.5.0] — 2026-05-25

### Added
- **Timed sessions** — choose a duration (15–120 min) when starting; blocking
  ends automatically at expiry (no PIN needed then) via a persisted alarm. A live
  countdown shows the time left. "Until I stop" keeps the old open-ended behavior.
- **Path-scoped allow rules** — an allow entry can include a path prefix, e.g.
  `example.com/exam` permits only `/exam` and below. Bare domains still match the
  whole base domain + subdomains.
- **Blocked-attempt log** — Options gains a read-only **Log** tab (between Settings
  and About) recording the off-limits sites that were blocked (host + time), most
  recent 200, clearable. Recorded locally; never synced.

### Fixed
- **Kiosk enforcement gap** — under `forceBlocking` the extension previously did
  not enforce on its own (it never held host access). The policy kit now uses
  `ExtensionSettings` with `runtime_allowed_hosts`, and `KIOSK.md` marks the
  native `URLAllowlist`/`URLBlocklist` as the mandatory enforcement layer.

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
