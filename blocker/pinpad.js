// Promise-based numeric PIN pad modal for the popup. Resolves with the entered
// PIN string, or null if cancelled. No inline handlers (MV3 CSP) — listeners are
// attached here; all text is passed in already-localized.
//
// modes:
//   "set"   — enter a PIN, then re-enter to confirm. A mismatch resets to the
//             first step and shows `mismatch`. Resolves the chosen PIN.
//   "enter" — enter a PIN once; `verify(pin)` decides. A failed verify shows
//             `wrong` and clears for a retry. Resolves only on a verified PIN.
const BTN =
  "rounded-lg border border-slate-200 bg-white py-2.5 text-lg font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700";

export function pinPad({
  mode = "enter",
  length = 4,
  minLength = 0,
  title = "",
  subtitle = "",
  confirmTitle = "",
  confirmSubtitle = "",
  mismatch = "",
  wrong = "",
  cancelLabel = "Cancel",
  backspaceLabel = "Delete",
  statusLabel = (n, total) => `${n} of ${total} digits entered`,
  verify,
} = {}) {
  return new Promise((resolve) => {
    let pin = "";
    let firstPass = null; // "set" mode: the first entry, awaiting confirmation
    const maxLen = length; // dots shown / hard cap
    const minLen = minLength || length; // enter mode verifies once this many digits are in
    let done = false; // guard against double-resolve while a verify is in flight
    const prevFocus = document.activeElement; // restored when the modal closes

    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm";

    const card = document.createElement("div");
    card.className =
      "w-full max-w-[15rem] rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "pinpad-title");
    card.setAttribute("aria-describedby", "pinpad-sub");
    card.tabIndex = -1; // focusable so we can move focus into the dialog on open

    const h = document.createElement("div");
    h.id = "pinpad-title";
    h.className = "text-center text-sm font-semibold text-slate-800 dark:text-slate-100";
    const sub = document.createElement("p");
    sub.id = "pinpad-sub";
    sub.className = "mt-1 text-center text-xs text-slate-500 dark:text-slate-400";

    const dots = document.createElement("div");
    dots.className = "mt-3 flex justify-center gap-2";
    dots.setAttribute("aria-hidden", "true"); // decorative; progress is announced via `live`
    const err = document.createElement("p");
    err.setAttribute("role", "alert"); // wrong/mismatch is announced assertively
    err.className = "mt-2 h-4 text-center text-xs font-medium text-red-600 dark:text-red-400";
    // Visually-hidden live region announcing entry progress to screen readers.
    const live = document.createElement("p");
    live.className = "sr-only";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");

    const pad = document.createElement("div");
    pad.className = "mt-3 grid grid-cols-3 gap-2";

    function setStage(t, s) {
      h.textContent = t;
      sub.textContent = s || "";
    }
    function renderDots() {
      dots.replaceChildren(
        ...Array.from({ length }, (_, i) => {
          const d = document.createElement("span");
          d.className =
            "h-3 w-3 rounded-full border " +
            (i < pin.length
              ? "border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400"
              : "border-slate-300 dark:border-slate-600");
          return d;
        }),
      );
      live.textContent = statusLabel(pin.length, maxLen);
    }
    // A toolbar popup sizes itself to its content, and a position:fixed overlay
    // doesn't add height — so without this the pad gets clipped. Grow the body
    // while the pad is open (the overlay's p-4 then gives padding top/bottom like
    // the sides), and restore on close.
    const prevMinHeight = document.body.style.minHeight;
    document.body.style.minHeight = "27rem";

    function close(result) {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey);
      document.body.style.minHeight = prevMinHeight;
      overlay.remove();
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus(); // restore focus
      resolve(result);
    }

    // "set" mode: first entry then a matching confirmation.
    function submitSet() {
      const entered = pin;
      if (firstPass === null) {
        firstPass = entered;
        pin = "";
        err.textContent = "";
        setStage(confirmTitle || title, confirmSubtitle);
        renderDots();
        return;
      }
      if (entered !== firstPass) {
        firstPass = null;
        pin = "";
        err.textContent = mismatch;
        setStage(title, subtitle);
        renderDots();
        return;
      }
      close(entered);
    }

    // "enter" mode: verify as soon as the entry could be valid (>= minLen), so a
    // PIN of any accepted length resolves; only clear once the cap is reached.
    async function tryVerify() {
      const attempt = pin;
      const ok = verify ? await verify(attempt) : true;
      if (done) return;
      if (ok) return close(attempt);
      if (pin.length >= maxLen) {
        pin = "";
        err.textContent = wrong;
        renderDots();
      }
    }

    function press(d) {
      if (done || pin.length >= maxLen) return;
      pin += d;
      err.textContent = "";
      renderDots();
      if (mode === "set") {
        if (pin.length === maxLen) submitSet();
      } else if (pin.length >= minLen) {
        tryVerify();
      }
    }
    function backspace() {
      pin = pin.slice(0, -1);
      renderDots();
    }
    // Keep Tab focus inside the modal (simple focus trap over its buttons).
    function trapTab(e) {
      const f = overlay.querySelectorAll("button");
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    function onKey(e) {
      if (e.key === "Escape") return close(null);
      if (e.key === "Tab") return trapTab(e);
      if (e.key === "Backspace") return backspace();
      if (/^[0-9]$/.test(e.key)) press(e.key);
    }

    function digit(d) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d;
      b.className = BTN;
      b.addEventListener("click", () => press(d));
      return b;
    }

    for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) pad.append(digit(d));

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = cancelLabel;
    cancelBtn.className =
      "rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-700";
    cancelBtn.addEventListener("click", () => close(null));
    pad.append(cancelBtn);

    pad.append(digit("0"));

    const back = document.createElement("button");
    back.type = "button";
    back.setAttribute("aria-label", backspaceLabel);
    back.title = backspaceLabel;
    back.className =
      "flex items-center justify-center rounded-lg border border-slate-200 bg-white py-2.5 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700";
    back.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9.75 14.25 12m0 0 2.25 2.25M14.25 12l2.25-2.25M14.25 12 12 14.25m-2.58 4.92-6.374-6.375a1.125 1.125 0 0 1 0-1.59L9.42 4.83c.21-.211.497-.33.795-.33H19.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25h-9.284c-.298 0-.585-.119-.795-.33Z" /></svg>';
    back.addEventListener("click", backspace);
    pad.append(back);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
    document.addEventListener("keydown", onKey);

    setStage(title, subtitle);
    renderDots();
    card.append(h, sub, dots, err, live, pad);
    overlay.append(card);
    document.body.append(overlay);
    card.focus(); // move focus into the dialog so the title is announced
  });
}
