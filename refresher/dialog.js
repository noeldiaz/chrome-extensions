// Minimal promise-based confirm modal (workspace convention: always confirm a
// destructive delete/clear/remove). Text is passed in already-localized; the
// caller awaits a boolean. No inline handlers (MV3 CSP) — listeners attached here.
export function confirmDialog({ title, body, confirmLabel = "OK", cancelLabel = "Cancel" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className =
      "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm";

    const card = document.createElement("div");
    card.className =
      "w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");

    const h = document.createElement("div");
    h.className = "text-sm font-semibold text-slate-800 dark:text-slate-100";
    h.textContent = title;

    const p = document.createElement("p");
    p.className = "mt-1.5 text-xs text-slate-500 dark:text-slate-400";
    p.textContent = body;

    const row = document.createElement("div");
    row.className = "mt-4 flex justify-end gap-2";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className =
      "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";
    cancel.textContent = cancelLabel;

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className =
      "rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400";
    ok.textContent = confirmLabel;

    function close(result) {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    }

    cancel.addEventListener("click", () => close(false));
    ok.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener("keydown", onKey);

    row.append(cancel, ok);
    card.append(h, p, row);
    overlay.append(card);
    document.body.append(overlay);
    ok.focus();
  });
}
