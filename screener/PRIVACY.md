# Privacy Policy — Screener

_Last updated: 2026-05-22_

Screener does **not** collect, sell, share, or transmit your data to the
developer or any third party. There are no analytics and no tracking.

## What it stores

In your browser (locally by default):

- **Settings** (`chrome.storage.local`): the ticket endpoint URL, the bearer
  token you enter, and your theme preference. These stay on your device except as
  described below — and, if you enable the optional **Sync across devices** toggle
  (off by default), the endpoint URL and bearer token are instead stored via the
  browser's account sync (`chrome.storage.sync`) so the browser roams them to your
  own browser account across your signed-in devices. The theme preference stays
  local. See [Sync across devices](#sync-across-devices) below.
- **Captured images** are held transiently in the browser's IndexedDB while a
  capture is being handed to the editor, and are deleted as soon as the editor
  opens them. They are not retained.

## What it sends, and only when you ask

Screener makes a network request in exactly one case: when you click **Submit
ticket**. At that moment it sends the screenshot plus the title and description
you typed to the **endpoint URL you configured yourself**, with your bearer token
in the `Authorization` header. That destination is your own server — Screener has
no endpoint of its own and the developer never receives this data.

If you never configure an endpoint or never click Submit, Screener makes no
network requests of its own at all. Download and Copy are entirely local. (If you
opt in to Sync across devices, the browser itself — not Screener — roams your
endpoint URL and token to your browser account, as described below.)

## Sync across devices

Screener has an optional **Sync across devices** toggle in Settings. It is **off
by default**, which keeps your settings on your local device only. When you turn
it on, your **ticket endpoint URL and bearer token** are stored using the
browser's built-in account sync (`chrome.storage.sync`) instead of local storage,
so the browser synchronizes them to your own browser account across the devices
where you're signed in to the same profile.

This is handled by the browser and tied to your own account — the data still
never goes to the developer, there is still no analytics or tracking, and the
only network request Screener itself ever makes is the ticket **Submit** to the
endpoint you configured. Turning Sync off keeps your settings local again.

## Permissions

- **`storage`** stores your settings locally, and also covers the optional
  account-synced storage used when you enable **Sync across devices** for your
  endpoint URL and bearer token.
- **Host access** to your endpoint's domain is requested only the first time you
  submit, and is used solely to send that request.
- Screen, tab, and page capture are initiated only by your explicit action and
  produce an image shown to you in the editor before anything is sent.

## Contact

Questions: noeldiaz@gmail.com
