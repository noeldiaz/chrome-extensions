# Screener → Laravel backend: build prompt

This document hands the backend work to a second Claude instance running **inside
your Laravel app**. It builds the API that issues auth tokens and accepts the
screenshot uploads the Screener Chrome extension submits.

## How to use this

1. Open your Laravel project in Claude Code (or paste into Claude in that repo).
2. Copy **everything between the two `─── COPY ───` markers** below and send it.
3. Follow its final instructions to mint a token, then paste the **endpoint URL**
   and **token** into Screener’s Options page.

The extension side is already built and frozen; the backend must match the
contract exactly as written below.

---

─── COPY FROM HERE ───────────────────────────────────────────

You are working inside an existing Laravel application. Build the backend that
receives support-ticket screenshots from a Chrome extension called **Screener**
and authenticates those requests with a bearer token.

First inspect the project and adapt to its conventions before writing code:
- Detect the Laravel and PHP versions (`composer.json`) and match existing style.
- Check whether `laravel/sanctum` is installed and whether a `users` table exists.
- Follow the app’s existing patterns for controllers, requests, models, and tests.
- Do not invent unrelated features. Build only what this spec describes.

### The exact request the extension sends

The extension performs a single HTTP call. You do not control its shape — match it.

```
POST <your endpoint>
Accept: application/json
Authorization: Bearer <token>          # present only if the user set a token
Content-Type: multipart/form-data       # boundary set by the browser
```

multipart/form-data fields:

| field        | type            | required | notes |
|--------------|-----------------|----------|-------|
| `title`      | string          | yes      | max 255 |
| `description`| string          | no       | free text, may be empty/absent |
| `screenshot` | file (image/png)| yes      | the annotated PNG, can be several MB (allow up to ~15MB) |
| `page_url`   | string          | no       | URL of the page that was captured (may be absent for full-screen) |
| `meta`       | string (JSON)   | no       | JSON-encoded object, see below |

`meta` decodes to:

```json
{
  "mode": "visible|selection|fullpage|fullscreen|null",
  "pageTitle": "string|null",
  "capturedAt": "ISO-8601 string|null",
  "userAgent": "string",
  "viewport": { "w": 1920, "h": 1080 },
  "devicePixelRatio": 2
}
```

### The exact response the extension expects

- **Success:** HTTP 200 or 201 with a JSON body. Include an `id`, and optionally
  a `url` the user can open to view the ticket:
  ```json
  { "id": 123, "url": "https://your-app.test/tickets/123" }
  ```
  The extension shows “Ticket submitted — #123” (or the URL when present).
- **Failure:** any non-2xx status with `{ "message": "..." }`. The extension shows
  that message verbatim. Laravel’s default 422 validation shape (`{ "message": ... }`)
  is fine.

### What to build

1. **Migration + model** — a `tickets` table:
   - `id`, `title` (string), `description` (text, nullable), `screenshot_path`
     (string), `page_url` (string, nullable), `meta` (json, nullable),
     `submitted_by` (nullable FK to users, the token’s owner), timestamps.
   - An Eloquent `Ticket` model with `meta` cast to array and appropriate
     `$fillable`/`$guarded`.

2. **Auth via Laravel Sanctum personal access tokens.**
   - If Sanctum isn’t installed, install and configure it (`composer require
     laravel/sanctum`, publish + migrate).
   - Protect the upload route with `auth:sanctum`.
   - Resolve the authenticated user as `submitted_by`.

3. **Route** — an API route (stateless, no CSRF/session) such as
   `POST /api/screener/tickets`, named, behind `auth:sanctum` and a rate limiter
   (e.g. `throttle:30,1`). Tell me the final URL at the end.

4. **FormRequest validation:**
   - `title` → `required|string|max:255`
   - `description` → `nullable|string`
   - `screenshot` → `required|image|mimes:png|max:15360` (15 MB)
   - `page_url` → `nullable|url`
   - `meta` → `nullable|json`

5. **Controller** — store the upload on a configured filesystem disk (use the
   app’s default disk; if it’s `public`, that’s fine), persist the `Ticket`,
   decode `meta` into the json column, and return `201` with `{ id, url }` where
   `url` is a route that displays the ticket (or a temporary/public URL to the
   stored image if a viewing page is out of scope).

6. **CORS / origin note:** the request arrives with `Origin:
   chrome-extension://<id>`. Because the extension holds host permission, it is
   exempt from browser CORS for the response, so you generally need **no** CORS
   config. If a strict global CORS or middleware would reject the
   `chrome-extension://` origin, allow it for this route only. Do **not** require
   a CSRF token on this route (keep it on the `api` stack, not `web`).

7. **A token-minting path** so I can authenticate the extension. Provide an
   Artisan command, e.g. `php artisan screener:issue-token {email}`, that finds or
   creates a user and prints a fresh Sanctum personal access token to stdout (the
   plain-text token, shown once). Keep it simple and safe.

8. **A feature test** that posts a fake PNG (`UploadedFile::fake()->image(...)`)
   with a valid token and asserts a 201 + a persisted `Ticket`, plus a test that a
   missing/invalid token is rejected (401) and that a missing `title` fails (422).

### Acceptance check

After building, this curl (filled in with a real token and a real PNG) must
create a ticket and return JSON with an `id`:

```bash
curl -i -X POST https://your-app.test/api/screener/tickets \
  -H "Accept: application/json" \
  -H "Authorization: Bearer <token>" \
  -F "title=Test ticket" \
  -F "description=Submitted from curl" \
  -F "screenshot=@/path/to/test.png;type=image/png" \
  -F "page_url=https://example.com" \
  -F 'meta={"mode":"visible","userAgent":"curl"}'
```

### When done, report back to me

- The final endpoint URL (to paste into the extension).
- The exact command to mint a token and where the token is printed.
- Which filesystem disk stores the screenshots and how to view a stored ticket.
- Any migration/config commands I still need to run.

─── COPY TO HERE ─────────────────────────────────────────────

---

## After the backend exists

In Screener’s **Options** page (gear icon in the popup or editor):

1. **Ticket endpoint URL** → the URL the backend reports (e.g.
   `https://your-app.test/api/screener/tickets`).
2. **Bearer token** → the token printed by the mint command.
3. Save, capture something, **Submit ticket** → approve the one-time host
   permission prompt for your endpoint’s domain → the POST fires.

If submit fails, the editor shows the server’s `message`, the HTTP status, or the
network error — use that to debug the backend side.
