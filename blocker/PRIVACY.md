# Privacy Policy — Blocker

_Last updated: 2026-05-25_

Blocker does **not** collect, transmit, sell, or share any personal data.

## What it stores

The extension stores the following **locally** in your browser
(`chrome.storage.local`):

- Your allowlist — the base domains you allow.
- Whether blocking is currently on.
- Your theme (light/dark) preference.

By default this data never leaves your device. There are no servers, no
analytics, no tracking, and the extension itself makes no network requests of any
kind.

## How blocking works

When blocking is on, Blocker watches your top-level navigations (via the
`webNavigation` API) and, if the destination isn't on your allowlist, replaces it
with the extension's own block page. The URLs you navigate to are inspected
in-browser, in the moment, only to make that allow/block decision — they are
**not** logged, stored, or transmitted anywhere.

## Sync across devices (optional)

Settings includes an optional **Sync across devices** toggle. It is **off by
default**, which keeps everything on your local device only. When you turn it on,
only your **allowlist** is stored using the browser's built-in account sync
(`chrome.storage.sync`) instead of local storage, so the browser roams it to your
own browser account across the devices where you're signed in. Whether blocking
is currently on always stays local to each device and is never synced.

This syncing is performed by the browser and tied to your own account — the data
still never goes to the developer, and there is still no analytics, no tracking,
and no network requests made by the extension itself.

## Permissions

- **Host access** (`http`/`https`, optional): the `webNavigation` API only
  reports navigations for sites you've granted access to. Blocker requests this
  the first time you start blocking — it's what lets the extension see (and block)
  where you're navigating. Nothing about those pages is stored or transmitted.

## Contact

Questions: noeldiaz@gmail.com
