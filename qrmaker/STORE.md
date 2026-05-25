# QRmaker — Chrome Web Store listing

Copy for the Chrome Web Store developer dashboard. Keep this in sync with
`manifest.json`, `README.md`, and `PRIVACY.md`.

## Name

QRmaker

## Summary (≤132 chars)

Make, style, and scan QR codes — encode the current tab, any link or text;
decode codes from images, the page, or your camera.

## Category

Productivity

## Detailed description

QRmaker turns the page you're on — or any link, text, or contact detail — into a
scannable QR code, and reads codes back from images, web pages, or your camera.
Everything runs locally in your browser. No accounts, no analytics, no servers.

MAKE A CODE
• One click on the toolbar icon shows a QR for the current tab's URL — point a
  phone at it to open the page there.
• The popup field takes any URL or text; edit it to encode whatever you like.
• Quick colors: a collapsible Options panel sets the dot, corner, and background
  colors, with a Reset.
• Download as PNG, SVG (vector), or JPG, or copy the image to the clipboard.

ADVANCED EDITOR (opens in a tab)
• Dot and corner style chips, separate dot / corner / background colors, a
  background gradient (linear or radial), margin, and an export-size slider.
• Add a center logo from your own uploaded logo library, with a live preview.
• Wrap the code in a printable "Scan me" card: a caption on a solid or gradient
  background, with the code on a clean white tile.
• Save the whole design as a named preset, reapply it from a dropdown, and mark
  one as the default that loads automatically.

STRUCTURED TYPES
Encode more than plain text: a Wi-Fi network (SSID / password / security), a
contact card (vCard), an email, an SMS, a phone number, or a map location (with
one-tap "Use my location").

SCAN & DECODE
• Right-click any image → "Scan QR code from this image."
• Right-click a page → "Scan QR codes on this page" to find and decode every QR
  rendered on it.
• Or use the popup's Scan button to read a code from a local image file, a
  dragged / pasted image, or a live camera feed.
Decoded content is labelled with its type and offers Go to / Copy / Edit; a
scanned structured code (e.g. Wi-Fi) reopens in its matching editor form.

HISTORY
Every code you download or copy is logged locally (content, source, date), capped
at the newest 200. Re-open any past code in the editor, delete rows, or clear all.

EXTRAS
• Right-click menus to make a code for the page, a link, a text selection, or an
  image address.
• Keyboard shortcut Alt+Shift+Q to open the popup (rebindable).
• Dark / light theme that follows your OS preference.
• Optional "Sync across devices" (off by default) keeps your style presets in
  sync through your own browser account.
• Backup & restore — export everything (settings, saved logos, and created-code
  history) to a JSON file and import it on another machine. Importing replaces
  what's on the device.

Your data stays in your browser. The only network request QRmaker ever makes is
fetching a single cross-origin image you ask it to scan, after you grant access.

## Single purpose

QRmaker creates QR codes from web page URLs, links, text, and structured data
(Wi-Fi, contacts, email, SMS, phone, location), and decodes QR codes from images,
web pages, or the camera — all locally in the browser.

## Permission justifications

| Permission | Justification |
|------------|---------------|
| `activeTab` | Reads the current tab's URL when you open the popup so it can encode that page, and grants temporary access to the active tab for the on-demand "Scan QR codes on this page" decode you trigger from the menu. |
| `storage` | Saves your theme, design presets, and default preset locally; the presets move to account-synced storage only if you turn on the optional Sync feature. |
| `clipboardWrite` | Copies the generated QR image to your clipboard when you click Copy. |
| `contextMenus` | Adds the right-click "Create QR code…" and "Scan…" entries. |
| `scripting` | Injects the QR decoder into the current tab only when you choose "Scan QR codes on this page," paired with activeTab so it runs only on that tab and only on your click. |
| `optional_host_permissions` (`http://*/*`, `https://*/*`) | Requested only when you scan a QR from an image hosted on another site, so the extension can fetch that one image's pixels to decode it. Not requested at install. |

Camera access (getUserMedia) and location (navigator.geolocation) use the
browser's own runtime prompts when you actively choose "Scan with camera" or
"Use my location" — they are not install-time extension permissions.

## Data usage / privacy disclosures

- **Does NOT collect or transmit** any user data. No analytics, no tracking, no
  remote servers, no third-party services.
- All QR encoding and decoding happens locally on the device.
- The active tab's URL, typed text, uploaded logos, design presets, and
  created-code history stay in the browser (storage / IndexedDB). Presets roam
  through the user's own browser account only if Sync is enabled.
- Camera frames and scanned page pixels are processed locally and never stored or
  uploaded.
- The single network request is fetching a cross-origin image the user explicitly
  chooses to scan, after granting access.
- Not sold or shared with third parties. Not used for credit, lending, or
  unrelated purposes.

Privacy policy: see `PRIVACY.md` in the repository.

## Assets checklist

- Icon: 128×128 (`icons/icon128.png`).
- Screenshots (1280×800 or 640×400): popup with a generated code, the advanced
  editor with a "Scan me" card, and the scan/result window.
