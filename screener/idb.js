// Tiny IndexedDB handoff for captured images. Shared by the service worker
// (writes) and the editor tab (reads + deletes). IndexedDB has a large quota
// and works across both contexts, unlike storage.session (10MB, in-memory).

const DB_NAME = "screener";
const STORE = "captures";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putCapture(id, value) {
  const db = await open();
  try {
    await run(db, "readwrite", (store) => store.put(value, id));
  } finally {
    db.close();
  }
}

// Read once and remove — captures are transient and should not linger on disk.
export async function takeCapture(id) {
  const db = await open();
  try {
    const value = await run(db, "readonly", (store) => store.get(id));
    if (value !== undefined) await run(db, "readwrite", (store) => store.delete(id));
    return value;
  } finally {
    db.close();
  }
}
