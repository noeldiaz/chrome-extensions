// Right-click context menus that open the editor prefilled with the chosen
// content. Decoding is a later phase; this is encode-only.

const WEB = ["http://*/*", "https://*/*"];

const msg = (k) => chrome.i18n.getMessage(k);

const MENUS = [
  { id: "qr-page", title: msg("menuQrPage"), contexts: ["page"], documentUrlPatterns: WEB },
  { id: "qr-link", title: msg("menuQrLink"), contexts: ["link"], targetUrlPatterns: WEB },
  { id: "qr-selection", title: msg("menuQrSelection"), contexts: ["selection"] },
  { id: "qr-image", title: msg("menuQrImage"), contexts: ["image"], targetUrlPatterns: WEB },
  { id: "qr-scan-image", title: msg("menuScanImage"), contexts: ["image"] },
  { id: "qr-scan-page", title: msg("menuScanPage"), contexts: ["page"], documentUrlPatterns: WEB },
  { id: "qr-history", title: msg("menuHistory"), contexts: ["action"] },
];

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENUS) chrome.contextMenus.create(m);
  });
}

chrome.runtime.onInstalled.addListener(buildMenus);

function dataFromInfo(info) {
  switch (info.menuItemId) {
    case "qr-link":
      return info.linkUrl || "";
    case "qr-selection":
      return (info.selectionText || "").trim();
    case "qr-image":
      return info.srcUrl || "";
    case "qr-page":
      return info.pageUrl || "";
    default:
      return "";
  }
}

// A compact popup window for the scan result.
function openResultWindow(query) {
  chrome.windows.create({
    url: chrome.runtime.getURL("result.html") + query,
    type: "popup",
    width: 460,
    height: 300, // result.js grows/shrinks the window to fit its content
  });
}

// Inject jsQR + the page scanner into the active tab (activeTab grants host
// access on the menu click; "scripting" lets us call the API), stash the
// decoded codes in session storage, and open the result window to list them.
async function scanPageAndShow(tabId) {
  if (tabId == null) return;
  let payload;
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      files: ["vendor/jsqr.js", "scanpage.js"],
    });
    payload = inj?.result ?? { results: [], tainted: 0, scanned: 0 };
  } catch (e) {
    payload = { results: [], tainted: 0, scanned: 0, error: e?.message || String(e) };
  }
  await chrome.storage.session.set({ pageScan: payload });
  openResultWindow("?mode=page");
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "qr-history") {
    chrome.tabs.create({ url: chrome.runtime.getURL("history.html") }).catch(() => {});
    return;
  }
  if (info.menuItemId === "qr-scan-page") {
    scanPageAndShow(tab?.id);
    return;
  }
  if (info.menuItemId === "qr-scan-image") {
    if (info.srcUrl) openResultWindow("?src=" + encodeURIComponent(info.srcUrl));
    return;
  }
  const data = dataFromInfo(info);
  if (!data) return;
  chrome.tabs
    .create({
      url: chrome.runtime.getURL("editor.html") + "?data=" + encodeURIComponent(data),
    })
    .catch(() => {});
});
