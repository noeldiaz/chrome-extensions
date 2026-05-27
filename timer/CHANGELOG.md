# Changelog

All notable changes to Timer are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
uses [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-05-27

First working version.

### Added
- Three tools — **Clock**, **Stopwatch**, and **countdown Timer** — switchable from
  a bottom tab bar in the toolbar popup.
- A **full-page** view (toolbar expand icon) with a centered, large readout and a
  **Fullscreen** mode (`F`) that hides all controls. `Space` toggles start/stop.
- State is stored in `chrome.storage.local`, so a running stopwatch or timer
  survives the popup closing and stays in sync between the popup and an open tab.
- **End-of-countdown alerts**, each toggleable in Settings: a Web Audio chime, a
  screen flash, and an optional system notification. The chime (via an offscreen
  document) and the notification are fired by the background, so they work even when
  no Timer window is open.
- Clock **24/12-hour** format and an optional seconds toggle.
- Light/dark theme with a toggle, following the OS until set. The full page and the
  options page share the workspace top bar (brand · theme · Close) and segmented
  tab styling; tabbed options page (Settings / About).
