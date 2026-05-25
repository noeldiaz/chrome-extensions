# Picker — Privacy Policy

_Last updated: 2026-05-25_

Picker is a Chrome extension that picks a colour from your screen and shows its
HEX / RGB / HSL / HSV values (and the nearest Tailwind colour). Everything
happens on your own device.

## What Picker does with your data

**It does not collect, transmit, or sell any personal data.** There are no
analytics, no tracking, no remote servers, no third-party services, and **no
network requests at all**. The extension works fully offline.

### Data you give it

| Data | Where it goes | Why |
|------|---------------|-----|
| The pixel colour you pick | Read in memory and shown in the popup | To display and copy its value |
| Recent colours (your last 12 picks) | Stored locally in your browser (`chrome.storage.local`) | So you can reload a recent colour |
| HEX letter-case setting and theme | Stored locally in your browser (`chrome.storage.local`) | To remember your preferences |
| A value you copy (HEX/RGB/HSL/HSV or a Tailwind name) | Written to your clipboard when you click | So you can paste it |

All of the above stays on your device. Uninstalling the extension, clearing its
storage, or using "Clear recent colours" in settings removes it.

## Permissions and why they are needed

- **`storage`** — remember your recent colours, HEX letter-case setting, and theme.

That is the only permission Picker requests. The on-screen eyedropper uses the
browser's built-in [`EyeDropper`](https://developer.mozilla.org/docs/Web/API/EyeDropper)
API, which needs no permission and samples pixels locally. Copying uses the
browser clipboard API and only runs when you click. Picker requests no host
access and never reads your browsing.

## Network access

Picker makes **no network requests**. It has no servers to talk to.

## Children's privacy

Picker does not collect any data and is not directed at children specifically.

## Changes to this policy

Any changes will be reflected in this file with an updated date.

## Contact

Questions about this policy: open an issue at
<https://github.com/noeldiaz/chrome-extensions>.
