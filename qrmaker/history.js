import { degToRad } from "./lib.js";
import { getHistory, deleteHistoryItem, clearHistory } from "./idb.js";
import { initTheme } from "./theme.js";

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

const BTN_OPEN =
  "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400";
const BTN_DEL =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-500 shadow-sm transition hover:border-red-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-red-500 dark:hover:bg-red-950 dark:hover:text-red-300";

const SVG = 'xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4"';
const ICON_OPEN = `<svg ${SVG}><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>`;
const ICON_DEL = `<svg ${SVG}><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;

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
  open.className = BTN_OPEN;
  open.innerHTML = ICON_OPEN + "<span>Open</span>";
  open.addEventListener("click", () =>
    chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") + "?history=" + item.id }),
  );
  actions.appendChild(open);

  const del = document.createElement("button");
  del.type = "button";
  del.title = "Delete";
  del.setAttribute("aria-label", "Delete");
  del.className = BTN_DEL;
  del.innerHTML = ICON_DEL;
  del.addEventListener("click", async () => {
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
  if (!window.confirm("Clear all created-code history? This can't be undone.")) return;
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

initTheme({ toggle: els.themeToggle, moon: els.moon, sun: els.sun });
render();
