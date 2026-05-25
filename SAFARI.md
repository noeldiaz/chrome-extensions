# Safari & Firefox builds

The extensions share one source tree. Per-target differences (manifest
permissions, runtime feature flags, dropped files) are applied by `build.mjs`,
which emits ready-to-package folders under `dist/<target>/<ext>/`.

```bash
node build.mjs safari            # all extensions for Safari → dist/safari/*
node build.mjs firefox           # all extensions for Firefox → dist/firefox/*
node build.mjs safari screener   # just one
node build.mjs all               # every target (chrome + safari + firefox)
```

`dist/` is git-ignored — it's rebuildable output. Attach packaged builds to
releases, don't commit them.

Safari packaging/signing is the bulk of this doc; the [Firefox](#firefox) section
at the end covers that target.

## Requirements

- macOS with **Xcode** installed.
- Target **Safari 16.4+ / macOS 13+** (where MV3 background service workers are
  supported).
- iOS is out of scope: `contextMenus`, `windows`, and `commands` are macOS-only
  in Safari.

## Convert each build into an app

Run after `node build.mjs safari`. Projects land under `dist/xcode/` (git-ignored):

```bash
xcrun safari-web-extension-converter dist/safari/qrmaker \
  --macos-only --app-name "QRmaker"  --bundle-identifier com.noeldiaz.QRmaker \
  --project-location dist/xcode/qrmaker --no-open --force

xcrun safari-web-extension-converter dist/safari/refresher \
  --macos-only --app-name "Refresher" --bundle-identifier com.noeldiaz.Refresher \
  --project-location dist/xcode/refresher --no-open --force

xcrun safari-web-extension-converter dist/safari/screener \
  --macos-only --app-name "Screener"  --bundle-identifier com.noeldiaz.Screener \
  --project-location dist/xcode/screener --no-open --force

xcrun safari-web-extension-converter dist/safari/picker \
  --macos-only --app-name "Picker"    --bundle-identifier com.noeldiaz.Picker \
  --project-location dist/xcode/picker --no-open --force
```

Each produces an Xcode project (a thin container app wrapping the web
extension). The converter warns about unsupported manifest keys (`type`,
`open_in_tab`) — harmless, Safari ignores them.

> **Bundle-id case matters.** The converter forces the *app's* bundle id to use
> the `--app-name` casing, while the *extension's* id is `<--bundle-identifier>.Extension`.
> If the last component of `--bundle-identifier` doesn't match `--app-name`
> exactly (case included), the extension id won't be prefixed by the app id and
> the build fails with *"Embedded binary's bundle identifier is not prefixed with
> the parent app's bundle identifier."* Keep them matched (e.g. app name
> `QRmaker` ↔ id `com.noeldiaz.QRmaker`).

## Sign (Developer ID)

Identity `Developer ID Application: Noel Diaz (4XJ5EWCZ6K)` must be in the login
keychain, with the partition list set so `codesign` doesn't GUI-prompt:

```bash
security set-key-partition-list -S apple-tool:,apple: -s \
  -k '<login-keychain-password>' ~/Library/Keychains/login.keychain-db
```

Build + sign each (hardened runtime + secure timestamp are required for
notarization). Run from the project dir, e.g. `dist/xcode/qrmaker/QRmaker`:

```bash
xcodebuild -project QRmaker.xcodeproj -scheme QRmaker -configuration Release \
  -destination 'platform=macOS' -derivedDataPath build \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Developer ID Application: Noel Diaz (4XJ5EWCZ6K)" \
  DEVELOPMENT_TEAM=4XJ5EWCZ6K PROVISIONING_PROFILE_SPECIFIER="" \
  ENABLE_HARDENED_RUNTIME=YES OTHER_CODE_SIGN_FLAGS="--timestamp" \
  clean build
```

Verify: `spctl -a -vvv -t exec <App>.app` → `accepted / source=Developer ID`.

### Strip `get-task-allow` before notarizing

Xcode injects the debug entitlement `com.apple.security.get-task-allow` into the
signed app **and** appex (via base-entitlement injection driven by the
`ENABLE_APP_SANDBOX` build settings — there are no `.entitlements` files in the
converter project). Notarization rejects any binary that has it
(*"The executable requests the com.apple.security.get-task-allow entitlement"*).

`CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO` is too blunt here — it drops *all*
entitlements including `app-sandbox`/`network.client`. Instead, re-sign each
binary inside-out, copying its real entitlements minus `get-task-allow`:

```bash
ID="Developer ID Application: Noel Diaz (4XJ5EWCZ6K)"
APP=<path>/<App>.app
APPEX=$(ls -d "$APP/Contents/PlugIns/"*.appex)

codesign -d --entitlements - --xml "$APP"   > /tmp/app.plist
codesign -d --entitlements - --xml "$APPEX" > /tmp/ext.plist
/usr/libexec/PlistBuddy -c "Delete :com.apple.security.get-task-allow" /tmp/app.plist
/usr/libexec/PlistBuddy -c "Delete :com.apple.security.get-task-allow" /tmp/ext.plist

codesign --force --options runtime --timestamp --entitlements /tmp/ext.plist --sign "$ID" "$APPEX"
codesign --force --options runtime --timestamp --entitlements /tmp/app.plist --sign "$ID" "$APP"
```

Verify it's gone: `codesign -d --entitlements - --xml "$APP" | grep -c get-task-allow` → `0`.

## Notarize + staple

One-time: store notarization credentials in the keychain (App Store Connect API
key preferred; never paste the secret inline):

```bash
xcrun notarytool store-credentials "cx-notary" \
  --key /path/AuthKey_XXXX.p8 --key-id <KEYID> --issuer <ISSUERID>
```

Then per app — zip, submit, staple:

```bash
ditto -c -k --keepParent <App>.app <App>.zip
xcrun notarytool submit <App>.zip --keychain-profile "cx-notary" --wait
xcrun stapler staple <App>.app          # then re-zip the stapled .app to distribute
```

## Run / test locally (unsigned, no notarization)

1. Open the generated project, build & run the container app once.
2. Safari → Settings → Advanced → enable **Show Develop menu**.
3. Safari → Develop → **Allow Unsigned Extensions** (resets every Safari launch).
4. Safari → Settings → Extensions → enable the extension.

## What the Safari target turns off

| Extension | Difference vs Chromium |
|-----------|------------------------|
| screener  | Full-screen capture removed (`offscreen` + `getDisplayMedia` unsupported); `chrome.downloads` → `<a download>` fallback. `offscreen`/`downloads` stripped from the manifest, `offscreen.{html,js}` dropped. Driven by `screener/build-config.js` → `FEATURES`. |
| refresher | Badge color setters are no-ops if Safari lacks them (text still shows). No build-time change. |
| qrmaker   | None — already uses `<a download>` and guards window resize. |
| picker    | No `EyeDropper` (Chromium-only) — the screen-pick button is disabled and the native color box takes over. No build-time change. |

## Caveats to validate on real Safari

These behave differently in Safari and need a manual check; they don't break the
build:

- **Host permissions** — all three call `chrome.permissions.request({origins})`
  (qrmaker `result.js`, refresher `popup.js`, screener `editor.js`). Safari grants
  host access per-site via its own UI rather than a broad runtime prompt. Confirm
  the grant flow works and add a fallback message if a request is silently denied.
- **`commands` shortcuts** — Safari ignores `suggested_key`; users assign shortcuts
  in Safari's settings. The commands still fire.
- **refresher badge** — `setBadgeText` shows, but the blue background / white text
  may be ignored (Safari styles badges its own way).

## Firefox

Firefox 121+ supports MV3. The `firefox` target adapts the manifest automatically:

```bash
node build.mjs firefox           # all extensions → dist/firefox/*
node build.mjs firefox picker    # just one
```

What `build.mjs` changes for Firefox (`transformManifest` gecko branch + `TARGETS.firefox`):

- **Background** → event page. `background.service_worker` becomes
  `background.scripts: ["background.js"]` (keeping `type: "module"`); Firefox MV3
  has no service-worker background. picker has no background, so it's unaffected.
- **Add-on id** — adds `browser_specific_settings.gecko.id` (`<ext>@noeldiaz.dev`,
  `strict_min_version: "121.0"`). Required for installation and for `storage.sync`.
- **`offscreen`** stripped (Firefox has no offscreen API), and `offscreen.{html,js}`
  dropped — so screener's full-page capture is off, same as Safari. `chrome.downloads`
  **is** supported in Firefox, so it stays (unlike Safari).
- **`minimum_chrome_version`** removed (Chromium-only key).

### Load temporarily

1. `node build.mjs firefox <ext>`.
2. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick any
   file in `dist/firefox/<ext>/` (e.g. `manifest.json`). Reloads on browser restart.

### Package for signing (AMO)

```bash
cd dist/firefox/<ext> && zip -r -FS ../<ext>-firefox.zip . -x '*.DS_Store'
# then submit the zip at addons.mozilla.org (or: web-ext sign --channel=unlisted)
```

### Per-extension notes (validate on real Firefox)

| Extension | Firefox notes |
|-----------|---------------|
| picker    | `EyeDropper` is unsupported — native color-box fallback takes over (same as Safari). `storage.sync`, `scripting`, page-scan all supported. |
| refresher | Badge text shows; `chrome.alarms`/`tabs` supported. Event-page background must re-register listeners at top level (already does). |
| screener  | Full-page capture off (no offscreen); visible-tab capture + `downloads` work. |
| qrmaker   | `<a download>` + `storage.sync` work; `chrome.storage.session` is supported in Firefox 115+. |

> **Not yet load-tested on Firefox.** The build is structurally correct, but the
> `chrome.*` promise calls and event-page background lifetime should be verified by
> loading each temporary add-on. If any `chrome.*` async call doesn't resolve, add
> [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill) and
> switch to `browser.*`.
