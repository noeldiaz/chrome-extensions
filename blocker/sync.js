// Opt-in cross-device sync config. The mechanism is shared (sync-core.js); only
// SYNC_KEYS differs. Here the allowlist roams; the per-device `blocking` switch,
// theme, and the flag itself stay local (whether blocking is on is a per-machine
// decision). See shared/README.md.
import { createSync } from "./sync-core.js";

export const SYNC_KEYS = ["allowed"];
export const { isSyncOn, syncGet, syncSet, syncRemove, setSyncEnabled } = createSync(SYNC_KEYS);
