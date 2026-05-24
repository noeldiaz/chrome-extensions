# Safari builds

The extensions share one source tree. Per-target differences (manifest
permissions, runtime feature flags, dropped files) are applied by `build.mjs`,
which emits ready-to-package folders under `dist/<target>/<ext>/`.

```bash
node build.mjs safari        # build all three for Safari → dist/safari/*
node build.mjs safari screener   # just one
node build.mjs all           # every target (chrome + safari)
```

`dist/` is git-ignored — it's rebuildable output. Attach packaged builds to
releases, don't commit them.

## Requirements

- macOS with **Xcode** installed.
- Target **Safari 16.4+ / macOS 13+** (where MV3 background service workers are
  supported).
- iOS is out of scope: `contextMenus`, `windows`, and `commands` are macOS-only
  in Safari.

## Convert each build into an app

Run after `node build.mjs safari`:

```bash
xcrun safari-web-extension-converter dist/safari/qrmaker \
  --macos-only --app-name "QRmaker"  --bundle-identifier com.noeldiaz.qrmaker  --no-open

xcrun safari-web-extension-converter dist/safari/refresher \
  --macos-only --app-name "Refresher" --bundle-identifier com.noeldiaz.refresher --no-open

xcrun safari-web-extension-converter dist/safari/screener \
  --macos-only --app-name "Screener"  --bundle-identifier com.noeldiaz.screener  --no-open
```

Each produces an Xcode project (a thin container app wrapping the web
extension). The converter prints warnings for unsupported APIs — expected; the
flags below already disable those paths.

## Run / test locally

1. Open the generated project, build & run the container app once.
2. Safari → Settings → Advanced → enable **Show Develop menu**.
3. Safari → Develop → **Allow Unsigned Extensions** (resets every Safari launch).
4. Safari → Settings → Extensions → enable the extension.

For distribution: Mac App Store, or Developer ID + notarization for a direct
`.app`. The generated Xcode project is where signing is configured.

## What the Safari target turns off

| Extension | Difference vs Chromium |
|-----------|------------------------|
| screener  | Full-screen capture removed (`offscreen` + `getDisplayMedia` unsupported); `chrome.downloads` → `<a download>` fallback. `offscreen`/`downloads` stripped from the manifest, `offscreen.{html,js}` dropped. Driven by `screener/build-config.js` → `FEATURES`. |
| refresher | Badge color setters are no-ops if Safari lacks them (text still shows). No build-time change. |
| qrmaker   | None — already uses `<a download>` and guards window resize. |

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
