# Timer

A clean **clock**, **stopwatch**, and **countdown timer** for Chrome — glanceable in
the toolbar popup, or opened full-screen in a tab.

## Tools

- **Clock** — a large running clock. 24- or 12-hour, optional seconds.
- **Stopwatch** — start / stop / resume, with laps (split + total).
- **Timer** — set H : M : S or tap a preset (5 / 10 / 30 min, 1 hour), then Start.
  Pause, resume, or reset at any time.

All three run in the popup *and* in a full tab, and they stay in sync — start a
timer in the popup, open the tab, and it's the same running timer. State survives
the popup closing.

## Full page & fullscreen

Click the **expand** icon in the popup (or the toolbar action) to open Timer in a
tab. There, **Fullscreen** (or the `F` key) hides every control and shows just the
big readout for the current tool. `Space` starts/stops the stopwatch or timer; `Esc`
leaves fullscreen.

## When a countdown ends

Pick any combination in **Settings**:

- **Sound** — a short chime from whichever Timer window is open (no extra permission).
- **Screen flash** — the open window pulses, for muted/glance use (no permission).
- **System notification** — shows even when no Timer window is open (uses the
  `notifications` permission).

> A countdown shorter than ~30 seconds that finishes while *every* Timer window is
> closed may notify a few seconds late — Chrome clamps background alarms to a 30s
> minimum. An open window always ends exactly on time.

## Permissions

- `storage` — remember your settings and the running clock/stopwatch/timer state.
- `alarms` — fire the countdown's end event after the popup is closed.
- `notifications` — the optional end-of-countdown system notification.

No host permissions, no content scripts, no network access.

## Develop

```bash
npm install
npm run build:css   # compile Tailwind → popup.css
npm run lint
npm test            # node:test, pure logic in lib.js
```

Load `timer/` unpacked in `chrome://extensions` (Developer mode). Package a release
zip from the repo root with `node build.mjs chrome timer`.
