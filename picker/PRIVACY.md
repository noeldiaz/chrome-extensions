# Picker — Privacy Policy

_Last updated: 2026-05-25_

Picker is a Chrome extension that picks a color from your screen and shows its
HEX / RGB / HSL / HSV values (and the nearest Tailwind color). Everything happens
on your own device, unless you opt in to the **Sync across devices** toggle (off
by default), which lets the browser roam a few preferences through your own
browser account.

## What Picker does with your data

**It does not collect, transmit, or sell any personal data.** There are no
analytics, no tracking, no remote servers, no third-party services, and the
extension itself makes **no network requests at all**. It works fully offline,
with one optional exception: if you turn on **Sync across devices** in Settings,
the browser roams a few of your preferences through your own browser account
(see [Sync across devices](#sync-across-devices) below). That syncing is done by
the browser, not by Picker, and still never reaches the developer.

### Data you give it

| Data | Where it goes | Why |
|------|---------------|-----|
| The pixel color you pick | Read in memory and shown in the popup | To display and copy its value |
| Recent colors (your last 12 picks) | Stored in your browser (`chrome.storage.local`, or `chrome.storage.sync` if you enable Sync) | So you can reload a recent color |
| HEX letter-case setting and theme | Stored in your browser (`chrome.storage.local`; HEX letter-case moves to `chrome.storage.sync` if you enable Sync, theme stays local) | To remember your preferences |
| Favorites (saved colors + names) | Stored in your browser (`chrome.storage.local`, or `chrome.storage.sync` if you enable Sync) | So you can keep a palette |
| A value you copy (HEX/RGB/HSL/HSV/OKLCH/… or a Tailwind name) | Written to your clipboard when you click | So you can paste it |
| Colors on the current page | Read from the page's computed styles locally when you click “Scan this page”, then shown in the popup | To list the page's colors in the Page tab |

The items stored in `chrome.storage.local` above (recent colors, favorites, HEX
letter-case, and the favorite formats / copy-on-pick settings) are instead stored
in `chrome.storage.sync` when you enable **Sync across devices**; theme stays
local. All of this stays on your device unless you opt in to that toggle — see
below. Uninstalling the extension, clearing its storage, or using "Clear recent
colors" in settings removes it.

## Sync across devices

Picker has an optional **Sync across devices** toggle in Settings. It is **off by
default**, which keeps everything on your local device only. When you turn it on,
these items are stored using the browser's built-in account sync
(`chrome.storage.sync`) instead of local storage:

- Favorite formats
- HEX letter-case
- Copy-on-pick
- Favorites
- Recent colors

The browser then synchronizes those items to your own browser account across the
devices where you're signed in to the same profile. This is handled entirely by
the browser and tied to your account — the data still never goes to the
developer, there is still no analytics or tracking, and Picker still makes no
network requests of its own. Turning Sync back off keeps your data local again.

## Permissions and why they are needed

- **`storage`** — remember your recent colors, favorites, settings, and theme.
  Also covers the optional account-synced storage used when you enable **Sync
  across devices**.
- **`activeTab`** + **`scripting`** — used **only** for the **Page** tab. When you
  click “Scan this page”, Picker reads the current tab's *colors* from its
  elements' computed styles so it can list them. This runs only on the tab you're
  viewing, only when you ask; it reads color values — not page text, form data,
  or URLs — and sends nothing anywhere. No access to other tabs or your browsing
  history, and no access until you invoke the extension.

The on-screen eyedropper uses the browser's built-in
[`EyeDropper`](https://developer.mozilla.org/docs/Web/API/EyeDropper) API, which
needs no permission and samples pixels locally. Copying uses the browser
clipboard API and only runs when you click.

## Network access

Picker makes **no network requests** of its own. It has no servers to talk to,
and page-color scanning happens entirely in your browser. The only data that may
leave your device is the optional **Sync across devices** preferences, which the
browser — not Picker — syncs to your own browser account when you enable that
toggle.

## Children's privacy

Picker does not collect any data and is not directed at children specifically.

## Changes to this policy

Any changes will be reflected in this file with an updated date.

## Contact

Questions about this policy: open an issue at
<https://github.com/noeldiaz/chrome-extensions>.
