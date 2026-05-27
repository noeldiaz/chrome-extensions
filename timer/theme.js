// Shared light/dark theme wiring for every Picker page. A page calls initTheme()
// with its toggle button + moon/sun icons; the choice is stored in
// chrome.storage.local ("theme": "dark" | "light", or unset = follow the OS) and
// the .dark class on <html> is kept in sync. Mirrors the popup-only theme pattern
// used across the workspace extensions.
const osThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

export function initTheme({ toggle, moon, sun }) {
  function apply(isDark) {
    document.documentElement.classList.toggle("dark", isDark);
    moon.classList.toggle("hidden", isDark);
    sun.classList.toggle("hidden", !isDark);
    document.body.classList.remove("invisible");
  }

  async function load() {
    const { theme } = await chrome.storage.local.get({ theme: null });
    apply(theme === "dark" || (theme == null && osThemeMedia.matches));
  }

  // Follow OS changes only while the user hasn't picked a theme explicitly.
  osThemeMedia.addEventListener("change", async (e) => {
    const { theme } = await chrome.storage.local.get({ theme: null });
    if (theme == null) apply(e.matches);
  });

  toggle.addEventListener("click", async () => {
    const isDark = !document.documentElement.classList.contains("dark");
    apply(isDark);
    await chrome.storage.local.set({ theme: isDark ? "dark" : "light" });
  });

  load();
}
