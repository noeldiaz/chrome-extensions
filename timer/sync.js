// Opt-in cross-device sync config. The mechanism is shared (sync-core.js); only
// SYNC_KEYS differs. Here the display/behaviour preferences roam; the running
// state (the selected tool, the live stopwatch `sw` and countdown `tm`) and the
// theme stay local to each device. See shared/README.md.
import { createSync } from "./sync-core.js";

export const SYNC_KEYS = [
  "clockStyle",
  "clockFormat",
  "clockSeconds",
  "clockNumerals",
  "clockDate",
  "swHundredths",
  "swTrim",
  "timerStyle",
  "timerNumerals",
  "timerTrim",
  "timerBadge",
  "timerOvertime",
  "alerts",
];
export const { isSyncOn, syncGet, syncSet, syncRemove, setSyncEnabled } = createSync(SYNC_KEYS);
