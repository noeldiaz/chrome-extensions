// Core of the opt-in cross-device sync shared by every extension. Each
// extension's sync.js calls createSync(SYNC_KEYS) with its own key list; the
// mechanism is identical and lives here:
//
//   - an opt-in flag in chrome.storage.local, so each device decides for itself;
//   - when ON, SYNC_KEYS live in chrome.storage.sync (small config/data only —
//     never large blobs; the sync quota is ~8KB/item, 100KB total), else local;
//   - get/set/remove that target the active area;
//   - migration of SYNC_KEYS between the two areas when the flag is toggled.
//
// See shared/README.md.
const FLAG = "syncEnabled";

export function createSync(SYNC_KEYS) {
  async function isSyncOn() {
    const { [FLAG]: on = false } = await chrome.storage.local.get({ [FLAG]: false });
    return on;
  }

  // The active storage area: sync when enabled, else local.
  async function area() {
    return (await isSyncOn()) ? chrome.storage.sync : chrome.storage.local;
  }

  // get/set/remove that target the active area. `defaults` works like the native
  // storage API (object of key->default, or an array/string of keys).
  async function syncGet(defaults) {
    return (await area()).get(defaults);
  }
  async function syncSet(obj) {
    return (await area()).set(obj);
  }
  async function syncRemove(keys) {
    return (await area()).remove(keys);
  }

  // Turn sync on/off, migrating SYNC_KEYS. Enabling adopts an existing cloud copy
  // if there is one (so a second device inherits it), else seeds the cloud from
  // this device. Disabling snapshots the cloud copy back into local. May throw if
  // the data exceeds the sync quota — callers should catch and surface it.
  async function setSyncEnabled(on) {
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

  return { isSyncOn, syncGet, syncSet, syncRemove, setSyncEnabled };
}
