// Shared light/dark theme controller. Pages tag their icons with
// [data-theme-moon] / [data-theme-sun] and call wireTheme + loadTheme.

const media = window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  for (const el of document.querySelectorAll("[data-theme-moon]")) el.classList.toggle("hidden", isDark);
  for (const el of document.querySelectorAll("[data-theme-sun]")) el.classList.toggle("hidden", !isDark);
  document.body.classList.remove("invisible");
}

export async function loadTheme() {
  const { theme } = await chrome.storage.local.get({ theme: null });
  applyTheme(theme === "dark" || (theme == null && media.matches));
}

export async function toggleTheme() {
  const isDark = !document.documentElement.classList.contains("dark");
  applyTheme(isDark);
  await chrome.storage.local.set({ theme: isDark ? "dark" : "light" });
}

export function wireTheme(buttonEl) {
  buttonEl?.addEventListener("click", toggleTheme);
  media.addEventListener("change", async (e) => {
    const { theme } = await chrome.storage.local.get({ theme: null });
    if (theme == null) applyTheme(e.matches); // only follow OS when user hasn't chosen
  });
}
