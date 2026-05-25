// Lightweight confirm modal usable on any Picker page (popup + options). Builds
// an overlay in the DOM and resolves true (confirmed) / false (cancelled).
// Avoids window.confirm, which is unreliable inside an action popup.
export function confirmDialog({ message, confirmText, cancelText, danger = true }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4";

    const card = document.createElement("div");
    card.className = "w-full max-w-xs rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800";

    const msg = document.createElement("p");
    msg.className = "text-sm text-slate-700 dark:text-slate-200";
    msg.textContent = message;

    const row = document.createElement("div");
    row.className = "mt-4 flex justify-end gap-2";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = cancelText;
    cancel.className =
      "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = confirmText;
    ok.className =
      (danger ? "bg-red-600 hover:bg-red-700 focus:ring-red-400" : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-400") +
      " rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-2";

    function close(val) {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(val);
    }
    function onKey(e) {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    }
    cancel.addEventListener("click", () => close(false));
    ok.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener("keydown", onKey);

    row.append(cancel, ok);
    card.append(msg, row);
    overlay.append(card);
    document.body.appendChild(overlay);
    ok.focus();
  });
}
