// Right-click context menus that open the editor prefilled with the chosen
// content. Decoding is a later phase; this is encode-only.

const WEB = ["http://*/*", "https://*/*"];

const MENUS = [
  { id: "qr-page", title: "Create QR code for this page", contexts: ["page"], documentUrlPatterns: WEB },
  { id: "qr-link", title: "Create QR code for this link", contexts: ["link"], targetUrlPatterns: WEB },
  { id: "qr-selection", title: "Create QR code for selection", contexts: ["selection"] },
  { id: "qr-image", title: "Create QR code for image address", contexts: ["image"], targetUrlPatterns: WEB },
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

chrome.contextMenus.onClicked.addListener((info) => {
  const data = dataFromInfo(info);
  if (!data) return;
  chrome.tabs.create({
    url: chrome.runtime.getURL("editor.html") + "?data=" + encodeURIComponent(data),
  });
});
