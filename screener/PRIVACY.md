# Privacy Policy — Screener

_Last updated: 2026-05-22_

Screener does **not** collect, sell, share, or transmit your data to the
developer or any third party. There are no analytics and no tracking.

## What it stores

Locally in your browser only:

- **Settings** (`chrome.storage.local`): the ticket endpoint URL, the bearer
  token you enter, and your theme preference. These never leave your device
  except as described below.
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
network requests at all. Download and Copy are entirely local.

## Permissions

- **Host access** to your endpoint's domain is requested only the first time you
  submit, and is used solely to send that request.
- Screen, tab, and page capture are initiated only by your explicit action and
  produce an image shown to you in the editor before anything is sent.

## Contact

Questions: noeldiaz@gmail.com
