// Session-lifecycle audit trail for the proctor — separate from the
// blocked-attempt log. Records when blocking started, stopped (and whether the
// session or the master PIN unlocked it), and when a timed session expired.
// Newest-first, capped, local only (never synced). Shared by popup + background.

const CAP = 500; // most recent events kept

// Append an event. `type` is "start" | "stop" | "expire"; `detail` is a small
// machine-readable hint the Options page maps to a label (e.g. minutes for a
// timed start, "master" when the master PIN was used).
export async function logEvent(type, detail = "") {
  const { auditLog = [] } = await chrome.storage.local.get({ auditLog: [] });
  auditLog.unshift({ type, detail: String(detail), ts: Date.now() });
  if (auditLog.length > CAP) auditLog.length = CAP;
  await chrome.storage.local.set({ auditLog });
}
