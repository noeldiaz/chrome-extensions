// Opt-in cross-device sync config. The mechanism is shared (sync-core.js); only
// SYNC_KEYS differs. Here the refresh defaults roam; theme, the per-tab `targets`
// map, and transient state (enabled/tabId) stay local. See shared/README.md.
import { createSync } from "./sync-core.js";

export const SYNC_KEYS = ["preserveScroll", "minutes", "seconds"];
export const { isSyncOn, syncGet, syncSet, syncRemove, setSyncEnabled } = createSync(SYNC_KEYS);
