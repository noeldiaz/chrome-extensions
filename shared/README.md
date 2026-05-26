# Shared modules

Canonical copies of the modules that are duplicated across the extensions. Edit
them **here**, then propagate:

```bash
node tools/sync-shared.mjs    # copy shared/* into each extension that uses it
node tools/check-shared.mjs   # exit non-zero if any extension copy has drifted
```

`files.json` maps each shared file to the extensions that use it.

The per-extension copies are **committed** — so `load-unpacked` works straight
from a source folder with no build step (the repo convention) — but they are
**generated**: don't edit them directly, edit the copy here and re-sync.
`check-shared.mjs` flags drift, and `build.mjs` overlays these files from here so
a release is always built from the canonical copy.

## Not shared (intentionally)

- `sync.js` — each extension has its own `SYNC_KEYS`.
- `theme.js` — diverges per extension (and blocker/refresher inline it).
- picker's `dialog.js` — a different API (`{ message, confirmText, … }`) and
  visual; unifying it is a separate task.
