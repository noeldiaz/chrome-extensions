// Opt-in cross-device sync config. The mechanism is shared (sync-core.js); only
// SYNC_KEYS differs. Here the ticket endpoint + token roam; theme and transient
// captures/blobs stay local. See shared/README.md.
import { createSync } from "./sync-core.js";

export const SYNC_KEYS = ["endpoint", "token"];
export const { isSyncOn, syncGet, syncSet, syncRemove, setSyncEnabled } = createSync(SYNC_KEYS);
