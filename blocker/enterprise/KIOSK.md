# Blocker — exam-kiosk deployment (managed Windows)

This guide turns Blocker into a **locked exam kiosk** on machines you control. The
extension alone is *not* exam-proof — a student owns the browser and can open
incognito, disable the extension, switch profiles, or edit storage via DevTools.
The lockdown becomes hard to escape only when you add **Chrome enterprise policy**,
which on Windows comes straight from the **registry** and needs **no Google
Workspace / Chrome Enterprise subscription**.

Think of it as three layers, strongest first:

1. **Chrome policy (registry)** — removes the escape hatches and gates sites at
   the browser level. `enterprise/chrome-kiosk.reg`.
2. **Locked extension config** — pushes a read-only allowlist + force-on blocking
   into Blocker via `chrome.storage.managed`. `enterprise/blocker-managed.reg`.
3. **The extension** — the live allowlist UI and the block page. It enforces in
   two layers: `declarativeNetRequest` rules that block disallowed navigations
   (incl. iframes) at the network layer *before they load*, plus a
   `webNavigation` backstop that also gates `data:` URLs and sweeps open tabs.

> **Tip — generate the policy from the allowlist.** Build your allowlist in the
> extension (Allowed tab, Bulk add accepts a pasted list), then click
> **Generate admin policy** there to download a `.reg` containing the native
> `URLAllowlist` *and* Blocker's managed `forceBlocking`/`lockAllowlist`/
> `allowedSites` for this install's extension id — no hand-editing. Set a custom
> block-page message under Settings → Block page message, or lock one for all
> machines with the managed `blockMessage` policy.

## What each policy does

| Policy | Value | Effect |
|---|---|---|
| `IncognitoModeAvailability` | `1` | No incognito windows at all (closes the main bypass). |
| `DeveloperToolsAvailability` | `2` | DevTools off everywhere — can't edit storage to clear the PIN or flip the flag. |
| `BrowserGuestModeEnabled` / `BrowserAddPersonEnabled` | `0` | No guest session, no second profile. |
| `ExtensionSettings` → `force_installed` + `runtime_allowed_hosts` | — | Force-installs Blocker (no Remove/Disable button) **and** grants it host access by policy, so its own blocking + the friendly block page actually run. |
| `URLBlocklist` = `["*"]` + `URLAllowlist` = approved | — | **Mandatory.** The real gate — Chrome blocks at the network layer before any page loads, with no service-worker timing gaps. The extension's blocking is a convenience layer on top, not a substitute. |

> ⚠️ **The `URLAllowlist`/`URLBlocklist` policy is the enforcement guarantee — do
> not skip it.** Blocker's own blocking needs host access; `ExtensionSettings`
> `runtime_allowed_hosts` grants that for the extension UI/block page, but the URL
> policy is what reliably stops navigation in every case.

The extension config (`blocker-managed.reg`) then sets `forceBlocking` (always on,
no stopping) and `lockAllowlist` (only your `allowedSites` apply; the student can't
add/remove). Admin-pushed sites appear in the popup as **locked** rows.

## Steps

1. **Get Blocker's extension ID.** It must be stable, which means installing from
   a hosted source rather than an unpacked folder:
   - **Easiest:** publish Blocker to the Chrome Web Store as **Unlisted** (private)
     and copy the 32-character ID from its URL. Keep the CWS update URL in
     `ExtensionSettings`: `https://clients2.google.com/service/update2/crx`.
   - **Self-host:** serve the packed `.crx` + an `update.xml` on your network and
     use that URL instead. (Pin a `key` in `manifest.json` so the ID is stable.)
2. **Edit the templates.** In both `.reg` files, replace every `EXTENSION_ID_HERE`
   with the real ID. In `chrome-kiosk.reg` → `URLAllowlist` and in
   `blocker-managed.reg` → `allowedSites`, put your real exam hosts.
3. **Apply the policy** to each machine (any one of):
   - double-click each `.reg` (or `reg import file.reg`) as admin;
   - deliver the same keys via **Group Policy** (the Chrome ADMX templates) or your
     **MDM**;
   - bake them into the device image.
4. **Verify.** Fully quit and reopen Chrome, then open `chrome://policy` and
   confirm the values are present and "OK". Blocker should be installed and not
   removable; `chrome://extensions` should offer no toggle for it.

## Test it like a student would

- Try incognito (Ctrl+Shift+N) → should be unavailable.
- Try F12 / DevTools → should be blocked.
- Try removing Blocker in `chrome://extensions` → no option.
- Navigate to a non-approved site → blocked (by both the URL policy and Blocker).
- Open the Blocker popup → blocking shows **Locked by administrator**, the
  allowlist is read-only, and Options is locked.

## Honest residual risks

This locks down **this Chrome, on this managed Windows machine**. It does **not**
stop a student who:

- boots another OS / a USB stick, or uses a different computer or their phone;
- has local admin rights and can remove the registry policy (apply it as HKLM and
  don't give students admin);
- uses a second browser you didn't lock down (also block/uninstall those).

For high-stakes exams, pair this with proctoring and/or a dedicated lockdown
environment (ChromeOS kiosk / managed guest session, or a lockdown browser such as
Safe Exam Browser). No browser extension can be a substitute for those.
