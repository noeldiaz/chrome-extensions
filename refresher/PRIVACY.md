# Privacy Policy — Refresher

_Last updated: 2026-05-26_

Refresher does **not** collect, transmit, sell, or share any personal data.

## What it stores

The extension stores the following **locally** in your browser
(`chrome.storage.local`):

- The tabs you choose to refresh (tab id, title, window id) and their intervals.
- Your refresh statistics (count and last-refresh time) per tab.
- Your interval and theme (light/dark) preferences.

By default this data never leaves your device. There are no servers, no
analytics, no tracking, and the extension itself makes no network requests of any
kind.

## Sync across devices (optional)

Settings includes an optional **Sync across devices** toggle. It is **off by
default**, which keeps everything on your local device only. When you turn it on,
only your **refresh defaults** — the interval (minutes/seconds) and the
scroll-preservation setting — are stored using the browser's built-in account
sync (`chrome.storage.sync`) instead of local storage, so the browser roams them
to your own browser account across the devices where you're signed in. Your
per-tab selections (which tabs are being refreshed) and other transient state
always stay local and are never synced.

This syncing is performed by the browser and tied to your own account — the data
still never goes to the developer, and there is still no analytics, no tracking,
and no network requests made by the extension itself.

## Permissions

- **Scroll preservation** (optional): when you enable it, Refresher runs a small
  script on the refreshed page solely to read and restore the scroll position.
  Nothing from the page is stored or transmitted. This access is requested only
  when you turn the feature on and is removed when you turn it off.

## Contact

Questions: noeldiaz@gmail.com
