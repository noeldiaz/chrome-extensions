import { degToRad } from "./lib.js";
import { getHistory, deleteHistoryItem, clearHistory } from "./idb.js";
import { initTheme } from "./theme.js";
import { iconEdit, iconTrash } from "./icons.js";
import { localize, t } from "./i18n.js";
import { confirmDialog } from "./dialog.js";

const $ = (id) => document.getElementById(id);
const els = {
  list: $("list"),
  empty: $("empty"),
  count: $("count"),
  clearAll: $("clearAll"),
  winClose: $("winClose"),
  themeToggle: $("theme-toggle"),
  moon: $("moon-icon"),
  sun: $("sun-icon"),
};

// --- rendering ---

// A small preview re-encoded from the stored content + style config (no logo —
// thumbnails are tiny and the library lookup isn't worth it here).
function thumb(content, cfg) {
  const wrap = document.createElement("div");
  wrap.className = "shrink-0 overflow-hidden rounded bg-white p-1";
  const mount = document.createElement("div");
  mount.className = "h-14 w-14";
  wrap.appendChild(mount);
  const c = cfg || {};
  const background = c.gradientOn
    ? {
        gradient: {
          type: c.gradType || "linear",
          rotation: degToRad(c.gradRotation || 0),
          colorStops: [
            { offset: 0, color: c.gradColor1 || "#ffffff" },
            { offset: 1, color: c.gradColor2 || "#ffffff" },
          ],
        },
      }
    : { color: c.colorBg || "#ffffff" };
  try {
    new QRCodeStyling({
      width: 56,
      height: 56,
      type: "canvas",
      data: content,
      margin: 2,
      qrOptions: { errorCorrectionLevel: c.ecLevel || "H" },
      dotsOptions: { color: c.colorDots || "#000000", type: c.dotStyle || "square" },
      cornersSquareOptions: { color: c.colorCorners || "#000000", type: c.cornerStyle || "square" },
      cornersDotOptions: { color: c.colorCorners || "#000000" },
      backgroundOptions: background,
    }).append(mount);
  } catch {
    /* payload too long to re-encode — leave the tile blank */
  }
  return wrap;
}

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function row(item) {
  const el = document.createElement("div");
  el.className =
    "flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800";
  el.appendChild(thumb(item.content, item.config));

  const body = document.createElement("div");
  body.className = "min-w-0 flex-1";
  const content = document.createElement("p");
  content.className = "break-all text-sm text-slate-800 dark:text-slate-100";
  content.textContent = item.content;
  body.appendChild(content);
  const meta = document.createElement("p");
  meta.className = "mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500";
  meta.textContent = item.source ? `${fmtDate(item.date)} · ${item.source}` : fmtDate(item.date);
  if (item.source) meta.title = item.source;
  body.appendChild(meta);
  el.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "flex shrink-0 gap-2";

  const open = document.createElement("button");
  open.type = "button";
  open.className = "qr-btn-primary";
  open.innerHTML = iconEdit + "<span>" + t("historyOpen") + "</span>";
  open.addEventListener("click", () =>
    chrome.tabs
      .create({ url: chrome.runtime.getURL("editor.html") + "?history=" + item.id })
      .catch(() => {}),
  );
  actions.appendChild(open);

  const del = document.createElement("button");
  del.type = "button";
  del.title = t("delete");
  del.setAttribute("aria-label", t("delete"));
  del.className = "qr-btn-del";
  del.innerHTML = iconTrash;
  del.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: t("delete"),
      body: t("deleteHistoryItemConfirm"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!ok) return;
    await deleteHistoryItem(item.id);
    el.remove();
    const left = els.list.children.length;
    setCount(left);
    if (left === 0) showEmpty();
  });
  actions.appendChild(del);

  el.appendChild(actions);
  return el;
}

function setCount(n) {
  els.count.textContent = n === 0 ? "" : `${n} code${n === 1 ? "" : "s"}`;
  els.clearAll.hidden = n === 0;
}

function showEmpty() {
  els.empty.hidden = false;
  setCount(0);
}

async function render() {
  let items = [];
  try {
    items = await getHistory();
  } catch {
    items = [];
  }
  els.list.replaceChildren(...items.map(row));
  if (items.length === 0) {
    showEmpty();
  } else {
    els.empty.hidden = true;
    setCount(items.length);
  }
}

els.clearAll.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: t("clearAll"),
    body: t("clearHistoryConfirm"),
    confirmLabel: t("clearAll"),
    cancelLabel: t("cancel"),
  });
  if (!ok) return;
  await clearHistory();
  els.list.replaceChildren();
  showEmpty();
});

els.winClose.addEventListener("click", async () => {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch {
    /* fall back to window.close() */
  }
  window.close();
});

localize();
initTheme({ toggle: els.themeToggle, moon: els.moon, sun: els.sun });
render();
