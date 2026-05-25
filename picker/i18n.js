// Apply the _locales catalog to a page. Chrome substitutes __MSG__ only in the
// manifest and CSS, so HTML is localized here at load:
//   data-i18n="key"                  -> element.textContent
//   data-i18n-attr="attr:key,attr:key" -> element.setAttribute(attr, msg)
// A missing/empty message leaves the markup's existing text as the fallback.
// IMPORTANT: only tag leaf text elements with data-i18n — setting textContent
// would wipe any child <svg>/<input>, so wrap mixed icon+text in a <span>.
export function localize(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    const msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  }
  for (const el of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(",")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      const msg = chrome.i18n.getMessage(key);
      if (msg) el.setAttribute(attr, msg);
    }
  }
}

// getMessage shorthand for JS strings; `subs` is a string or array (max 9).
export const t = (key, subs) => chrome.i18n.getMessage(key, subs);
