# QRmaker — Privacy Policy

_Last updated: 2026-05-23_

QRmaker is a Chrome extension that generates and decodes QR codes entirely on
your own device. It is built so that your data stays in your browser — the only
exception is the optional **Sync across devices** toggle (off by default), which
lets the browser roam your design presets through your own browser account; see
[Sync across devices](#sync-across-devices) below.

## What QRmaker does with your data

**It does not collect, transmit, or sell any personal data.** There are no
analytics, no tracking, no remote servers, and no third-party services. All
encoding and decoding happens locally in your browser.

### Data you give it

| Data | Where it goes | Why |
|------|---------------|-----|
| The active tab's URL | Read in memory to pre-fill the code; never sent anywhere | So the popup can encode the current page |
| Text / URLs you type | Encoded locally into a QR image | To make your code |
| Center logos you upload | Stored locally in your browser (IndexedDB) | To reuse them as a logo library |
| Design presets and theme | Stored in your browser (`chrome.storage.local`; presets move to `chrome.storage.sync` if you enable Sync) | To remember your settings |
| Created-code history | Stored locally in your browser (IndexedDB), capped at the newest 200 | So you can re-open past codes |
| Images / camera frames you scan | Decoded locally in your browser; pixels are never uploaded | To read a QR code |

All of the above stays on your device, unless you opt in to **Sync across
devices** (see below), in which case your design presets and default preset roam
through your own browser account. Uninstalling the extension, or clearing the
extension's storage, removes it.

## Sync across devices

QRmaker has an optional **Sync across devices** toggle in Settings. It is **off
by default**, which keeps everything on your local device only. When you turn it
on, your **design presets and default preset** are stored using the browser's
built-in account sync (`chrome.storage.sync`) instead of local storage, so the
browser roams them to your own browser account across the devices where you're
signed in. Your uploaded center logos (IndexedDB) and your created-code history
always stay local and are never synced.

This syncing is handled by the browser and tied to your own account — the data
still never goes to the developer, there is still no analytics or tracking, and
the extension itself still makes no network requests of its own beyond the single
cross-origin image case described below. Turning Sync off keeps everything local
again.

## Permissions and why they are needed

- **`activeTab`** — read the current tab's URL when you open the popup. No
  install-time access to your browsing.
- **`storage`** — remember your theme, design presets, and default preset. Also
  covers the optional account-synced storage used when you enable **Sync across
  devices** for your presets.
- **`clipboardWrite`** — copy a QR image to the clipboard when you ask.
- **`contextMenus`** — add the right-click "Create QR code…" and "Scan…" items.
- **`scripting`** (with `activeTab`) — inject the decoder into the current tab
  only when you choose "Scan QR codes on this page," and only on that click.
- **Camera** (`getUserMedia`) — used only while you actively choose "Scan with
  camera." Frames are processed locally to find a QR code and are never stored
  or transmitted. The camera is released as soon as a code is found or you stop.
- **Location** (`navigator.geolocation`) — used only when you click "Use my
  location" for the editor's Location code type, to fill the latitude/longitude
  fields. Read once per click, kept local, and never transmitted. Requested via
  the browser's own prompt — not an install-time permission.
- **Optional host permissions (`http`/`https`)** — requested **only** when you
  scan a QR code from an image hosted on another website, so the extension can
  fetch that one image's pixels to decode it. Not requested at install.

## Network access

QRmaker reaches the network in exactly one case: when you scan a QR code from a
**cross-origin image** and grant access, it fetches that single image so it can
read its pixels. It makes no other network requests.

## Children's privacy

QRmaker does not collect any data and is not directed at children specifically.

## Changes to this policy

Any changes will be reflected in this file with an updated date.

## Contact

Questions about this policy: open an issue at
<https://github.com/noeldiaz/chrome-extensions>.
