// Opt-in cross-device sync config. The mechanism is shared (sync-core.js); only
// SYNC_KEYS differs. Here the presets + default-preset choice roam; theme, the
// pageScan session handoff, and the saved logos (large image dataURLs in
// IndexedDB) stay local. See shared/README.md.
import { createSync } from "./sync-core.js";

export const SYNC_KEYS = ["presets", "defaultPresetId"];
export const { isSyncOn, syncGet, syncSet, syncRemove, setSyncEnabled } = createSync(SYNC_KEYS);
