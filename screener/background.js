import { PROTECTED_URL } from "./lib.js";

// Captured images are held in chrome.storage.session (in-memory, never written
// to disk) and handed to the editor tab by id. The editor removes its key on load.
const SESSION_PREFIX = "capture:";

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function stashCapture(dataUrl, meta) {
  const id = newId();
  await chrome.storage.session.set({ [SESSION_PREFIX + id]: { dataUrl, meta } });
  return id;
}

async function openEditor(id) {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?id=${id}`) });
}

async function captureVisible(tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const meta = {
    mode: "visible",
    pageUrl: tab.url || "",
    pageTitle: tab.title || "",
    capturedAt: new Date().toISOString(),
  };
  return { dataUrl, meta };
}

async function handleCapture(msg) {
  const { mode, tab } = msg;

  switch (mode) {
    case "visible": {
      if (PROTECTED_URL.test(tab?.url || "")) return { ok: false, error: "Can't capture this page." };
      const { dataUrl, meta } = await captureVisible(tab);
      const id = await stashCapture(dataUrl, meta);
      await openEditor(id);
      return { ok: true };
    }
    default:
      return { ok: false, error: `${mode} capture is coming in a later build.` };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "capture") {
    handleCapture(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // async response
  }
  return false;
});
