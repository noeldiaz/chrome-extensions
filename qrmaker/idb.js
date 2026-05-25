// IndexedDB for things too big or too numerous for storage.local: the saved
// center-logo images ("logos") and the history of created codes ("history").
// One DB "qrmaker".

const DB = "qrmaker";
const STORE = "logos";
const HISTORY = "history";
const HISTORY_CAP = 200; // keep the newest N created codes; prune the rest

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(HISTORY)) {
        db.createObjectStore(HISTORY, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addLogo(dataUrl) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).add({ dataUrl, createdAt: Date.now() });
      req.onsuccess = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getLogos() {
  const db = await open();
  try {
    const all = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}

export async function deleteLogo(id) {
  const db = await open();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// --- created-codes history ---

// Record a created code. Entry = { content, source, config }. If the newest
// matching code (same content + config) already exists, just bump its date so
// re-downloading/copying the same code doesn't pile up duplicate rows.
export async function addHistory(entry) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY, "readwrite");
      const store = tx.objectStore(HISTORY);
      let resultId = null;
      const all = store.getAll();
      all.onsuccess = () => {
        const cfg = JSON.stringify(entry.config ?? null);
        const dup = (all.result || []).find(
          (e) => e.content === entry.content && JSON.stringify(e.config ?? null) === cfg,
        );
        const rec = { ...entry, date: Date.now() };
        if (dup) {
          rec.id = dup.id;
          resultId = dup.id;
          store.put(rec);
        } else {
          const add = store.add(rec);
          add.onsuccess = () => (resultId = add.result);
          // prune oldest beyond the cap
          const sorted = (all.result || []).slice().sort((a, b) => a.date - b.date);
          for (let i = 0; i < sorted.length + 1 - HISTORY_CAP; i++) store.delete(sorted[i].id);
        }
      };
      tx.oncomplete = () => resolve(resultId);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Overwrite a specific history record in place (used when a code re-opened from
// the history is re-exported after edits — update it, don't add a new row).
export async function updateHistoryItem(id, entry) {
  const db = await open();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY, "readwrite");
      tx.objectStore(HISTORY).put({ ...entry, id, date: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getHistory() {
  const db = await open();
  try {
    const all = await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY, "readonly");
      const req = tx.objectStore(HISTORY).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => b.date - a.date); // newest first
  } finally {
    db.close();
  }
}

export async function getHistoryItem(id) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY, "readonly");
      const req = tx.objectStore(HISTORY).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteHistoryItem(id) {
  const db = await open();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY, "readwrite");
      tx.objectStore(HISTORY).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function clearHistory() {
  const db = await open();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY, "readwrite");
      tx.objectStore(HISTORY).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// --- backup adapter (used by backup.js) ---
// Both stores use an inline keyPath ("id"), so put(record) restores each row
// under its original id; no separate key array is needed.

function getAllFrom(db, store) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function exportAll() {
  const db = await open();
  try {
    const [logos, history] = await Promise.all([getAllFrom(db, STORE), getAllFrom(db, HISTORY)]);
    return { logos, history };
  } finally {
    db.close();
  }
}

export async function importAll(data) {
  const db = await open();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, HISTORY], "readwrite");
      const logos = tx.objectStore(STORE);
      const history = tx.objectStore(HISTORY);
      logos.clear();
      history.clear();
      for (const r of data?.logos || []) logos.put(r);
      for (const r of data?.history || []) history.put(r);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
