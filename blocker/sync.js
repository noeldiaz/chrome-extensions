// Optional cross-device sync (workspace convention; see also i18n.js).
//
// The opt-in flag lives in chrome.storage.local so each device decides for
// itself. When sync is ON the SYNC_KEYS live in chrome.storage.sync (small
// config + data only — never large blobs; the sync quota is ~8KB/item, 100KB
// total). Toggling migrates those keys between the two areas. Everything else
// (the flag, theme, and the per-device `blocking` switch) keeps using
// chrome.storage.local directly — whether blocking is on is a per-machine
// decision, but the allowlist is worth carrying across devices.
const FLAG = "syncEnabled";

// Keys that follow the user across devices when sync is enabled.
export const SYNC_KEYS = ["allowed"];

export async function isSyncOn() {
  const { [FLAG]: on = false } = await chrome.storage.local.get({ [FLAG]: false });
  return on;
}

// The active storage area: sync when enabled, else local.
async function area() {
  return (await isSyncOn()) ? chrome.storage.sync : chrome.storage.local;
}

// get/set/remove that target the active area. `defaults` works like the native
// storage API (object of key->default, or an array/string of keys).
export async function syncGet(defaults) {
  return (await area()).get(defaults);
}
export async function syncSet(obj) {
  return (await area()).set(obj);
}
export async function syncRemove(keys) {
  return (await area()).remove(keys);
}

// Turn sync on/off, migrating SYNC_KEYS. Enabling adopts an existing cloud copy
// if there is one (so a second device inherits it), else seeds the cloud from
// this device. Disabling snapshots the cloud copy back into local. May throw if
// the data exceeds the sync quota — callers should catch and surface it.
export async function setSyncEnabled(on) {
  if (on) {
    const cloud = await chrome.storage.sync.get(SYNC_KEYS);
    if (!Object.keys(cloud).length) {
      const local = await chrome.storage.local.get(SYNC_KEYS);
      if (Object.keys(local).length) await chrome.storage.sync.set(local);
    }
  } else {
    const cloud = await chrome.storage.sync.get(SYNC_KEYS);
    if (Object.keys(cloud).length) await chrome.storage.local.set(cloud);
  }
  await chrome.storage.local.set({ [FLAG]: on });
}
