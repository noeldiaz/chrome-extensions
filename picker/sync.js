// Opt-in cross-device sync config. The mechanism is shared (sync-core.js); only
// SYNC_KEYS differs. Here the palette + format prefs roam; theme and transient UI
// flags (like optionsTab) stay local. See shared/README.md.
import { createSync } from "./sync-core.js";

export const SYNC_KEYS = ["recent", "favorites", "hexUpper", "formats", "copyOnPick"];
export const { isSyncOn, syncGet, syncSet, syncRemove, setSyncEnabled } = createSync(SYNC_KEYS);
