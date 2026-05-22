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
    await run(db, "readwrite", (store) => store.put({ ...value, _ts: Date.now() }, id));
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

// Drop captures the editor never picked up (tab closed before load), so
// screenshots don't linger on disk.
export async function purgeStale(maxAgeMs = 5 * 60 * 1000) {
  const db = await open();
  const cutoff = Date.now() - maxAgeMs;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const cursorReq = tx.objectStore(STORE).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const v = cursor.value;
        if (!v || typeof v._ts !== "number" || v._ts < cutoff) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
