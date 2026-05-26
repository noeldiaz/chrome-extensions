// Export / import everything this extension stores, as one JSON file, so the
// user can back it up and restore it on another machine. The file is tagged
// with the app id; importing a file made by a different extension is rejected.
//
// Captured: every chrome.storage.local + chrome.storage.sync key. Extensions
// that keep bulk data in IndexedDB pass an `idb` adapter — an object exposing
// exportAll() and importAll(data) — so that data rides along too. Restore
// replaces local (a faithful per-device snapshot) and merges sync keys (so a
// cloud copy already on the target machine isn't surprise-wiped).

const SCHEMA = 1;

// Gather everything into one plain, JSON-serializable object.
export async function buildBackup(app, idb = null) {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get(null),
    chrome.storage.sync.get(null),
  ]);
  const out = {
    app,
    schema: SCHEMA,
    version: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    local,
    sync,
  };
  if (idb) out.idb = await idb.exportAll();
  return out;
}

// Build the backup and trigger a download via an <a download> blob URL
// (Safari-safe; no dependency on chrome.downloads).
export async function downloadBackup(app, idb = null) {
  const data = await buildBackup(app, idb);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${app}-backup-${data.exportedAt.slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Parse + validate a chosen backup file's text. Throws an Error whose message is
// an i18n key the caller can localize: "backupErrJson" (not JSON) or
// "backupErrApp" (missing/foreign app tag).
export function parseBackup(text, app) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("backupErrJson");
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || data.app !== app) {
    throw new Error("backupErrApp");
  }
  // Refuse a backup written by a newer schema than this build understands, rather
  // than silently mis-restoring it. (err.message is an i18n key for the caller.)
  if (typeof data.schema === "number" && data.schema > SCHEMA) {
    throw new Error("backupErrVersion");
  }
  return data;
}

// Write a parsed backup back into storage (and IndexedDB if an adapter is
// given). Local is cleared first for a faithful restore; sync keys are merged so
// an existing cloud copy on this machine isn't dropped. May throw if the sync
// payload exceeds quota — callers should catch and surface it.
export async function restoreBackup(data, idb = null) {
  if (data.local && typeof data.local === "object") {
    await chrome.storage.local.clear();
    if (Object.keys(data.local).length) await chrome.storage.local.set(data.local);
  }
  if (data.sync && typeof data.sync === "object" && Object.keys(data.sync).length) {
    await chrome.storage.sync.set(data.sync);
  }
  if (idb && data.idb) await idb.importAll(data.idb);
}
