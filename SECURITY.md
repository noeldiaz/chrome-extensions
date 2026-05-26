# Security Policy

This repo holds several independent Manifest V3 Chrome extensions
(`refresher`, `screener`, `qrmaker`, `picker`, `blocker`). All of them run
locally in the browser, make no network requests of their own, and store data
in `chrome.storage` (locally by default; optionally roamed through the user's
own browser-account sync). None collect or transmit data to the developer.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue, since
that discloses the problem before it can be fixed.

- **Preferred:** GitHub's private vulnerability reporting — the **Security** tab
  → **Report a vulnerability** ([Security Advisories][advisories]).
- **Email:** noeldiaz@gmail.com

Helpful to include:

- Which extension and version (see its `manifest.json` / the store listing).
- Browser and OS.
- Steps to reproduce, expected vs. actual behavior, and impact.
- Any proof-of-concept.

This is a solo, best-effort project — there is no paid bug bounty and no
guaranteed response time, but reports are taken seriously and acknowledged as
soon as possible. Coordinated disclosure is appreciated: please give a
reasonable window to ship a fix before publishing details.

## Supported versions

Only the latest published version of each extension is supported. Fixes ship in
a new version; there are no backported patch releases for older versions.

## Scope

In scope — anything that lets an extension:

- read, exfiltrate, or transmit user data contrary to its privacy policy;
- execute remote or injected code (all code is bundled; nothing is remote-loaded);
- escalate beyond its declared permissions, or abuse an optional host permission
  granted for one purpose (e.g. Refresher's scroll-preservation access).

Out of scope / by design:

- **Blocker is not exam-proof as a standalone extension.** A user with control of
  their own browser or OS can bypass any in-browser blocker. Blocker's robust
  enforcement is the **enterprise policy layer** (managed `URLAllowlist` /
  `URLBlocklist`, force-install, locked settings). The residual risks of the
  standalone mode are documented and intentional — see
  [`blocker/enterprise/KIOSK.md`](blocker/enterprise/KIOSK.md). Bypasses that
  KIOSK.md already lists as known limitations are not treated as
  vulnerabilities.
- Issues requiring a compromised device, a malicious OS-level actor, or
  physical access.
- Findings in third-party browser APIs themselves (report those to the browser
  vendor).

[advisories]: https://github.com/noeldiaz/chrome-extensions/security/advisories
