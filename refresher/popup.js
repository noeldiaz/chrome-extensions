import {
  MIN_TOTAL_SECONDS,
  PROTECTED_URL,
  SCROLL_ORIGINS,
  alarmName,
  secondsUntil,
  formatMMSS,
  intervalLabel,
  statsLabel,
  readInterval as parseInterval,
} from "./lib.js";

const minutesEl = document.getElementById("minutes");
const secondsEl = document.getElementById("seconds");
const statusEl = document.getElementById("status");
const presetsEl = document.getElementById("presets");
const addEl = document.getElementById("add");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const preserveScrollEl = document.getElementById("preserveScroll");
const themeToggleEl = document.getElementById("theme-toggle");
const moonIconEl = document.getElementById("moon-icon");
const sunIconEl = document.getElementById("sun-icon");

let countdownTimer = null;

const osThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

async function loadTheme() {
  const { theme } = await chrome.storage.local.get({ theme: null });
  applyTheme(theme === "dark" || (theme == null && osThemeMedia.matches));
}

osThemeMedia.addEventListener("change", async (e) => {
  const { theme } = await chrome.storage.local.get({ theme: null });
  if (theme == null) applyTheme(e.matches);
});

function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  moonIconEl.classList.toggle("hidden", isDark);
  sunIconEl.classList.toggle("hidden", !isDark);
  document.body.classList.remove("invisible");
}

async function toggleTheme() {
  const isDark = !document.documentElement.classList.contains("dark");
  applyTheme(isDark);
  await chrome.storage.local.set({ theme: isDark ? "dark" : "light" });
}

function readInterval() {
  return parseInterval(minutesEl.value, secondsEl.value);
}

function highlightActivePreset(totalSeconds) {
  for (const btn of presetsEl.querySelectorAll(".preset-btn")) {
    btn.classList.toggle("is-active", Number(btn.dataset.seconds) === totalSeconds);
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// --- live countdown (popup only; SW runs no timers) ---

async function tickCountdown() {
  for (const span of listEl.querySelectorAll("[data-countdown]")) {
    const alarm = await chrome.alarms.get(alarmName(span.dataset.countdown));
    span.textContent = alarm ? formatMMSS(secondsUntil(alarm.scheduledTime)) : "--:--";
  }
  for (const el of listEl.querySelectorAll("[data-stats]")) {
    const count = Number(el.dataset.count) || 0;
    const last = el.dataset.last ? Number(el.dataset.last) : null;
    el.textContent = statsLabel(count, last); // recompute "ago" each tick
  }
}

function startCountdown() {
  stopCountdown();
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

// --- target list ---

function buildRow(tabId, t) {
  const row = document.createElement("div");
  row.className =
    "rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none";

  const head = document.createElement("div");
  head.className = "flex items-baseline justify-between gap-3";

  const title = document.createElement("div");
  title.className = "truncate text-sm text-slate-900 dark:text-slate-100";
  title.textContent = t.tabTitle || `Tab #${tabId}`;
  title.title = title.textContent;

  const countdown = document.createElement("div");
  countdown.className = "shrink-0 text-sm font-medium tabular-nums text-blue-700 dark:text-blue-400";
  countdown.dataset.countdown = String(tabId);

  head.append(title, countdown);

  const foot = document.createElement("div");
  foot.className = "mt-1 flex items-center justify-between";

  const interval = document.createElement("span");
  interval.className = "text-xs text-slate-500 dark:text-slate-400";
  interval.textContent = `Every ${intervalLabel(t.minutes, t.seconds)}`;

  const actions = document.createElement("div");
  actions.className = "flex items-center gap-5";

  const go = document.createElement("button");
  go.type = "button";
  go.className = "text-xs text-blue-600 hover:underline dark:text-blue-400";
  go.textContent = "Go";
  go.title = "Switch to tab";
  go.addEventListener("click", () => jumpToTab(tabId));

  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "text-xs text-red-600 hover:underline dark:text-red-400";
  stop.textContent = "Stop";
  stop.addEventListener("click", () => stopTarget(tabId));

  actions.append(go, stop);
  foot.append(interval, actions);

  const stats = document.createElement("div");
  stats.className = "mt-0.5 text-[11px] tabular-nums text-slate-400 dark:text-slate-500";
  stats.dataset.stats = String(tabId);
  stats.dataset.count = String(t.count || 0);
  stats.dataset.last = t.lastRefresh ? String(t.lastRefresh) : "";
  stats.textContent = statsLabel(t.count || 0, t.lastRefresh || null);

  row.append(head, foot, stats);
  return row;
}

async function renderList() {
  const { targets } = await chrome.storage.local.get({ targets: {} });
  const ids = Object.keys(targets);

  listEl.replaceChildren();
  countEl.textContent = ids.length ? String(ids.length) : "";
  emptyEl.hidden = ids.length > 0;

  for (const id of ids) listEl.appendChild(buildRow(Number(id), targets[id]));

  if (ids.length) startCountdown();
  else stopCountdown();

  await updateAddButton(targets);
}

async function updateAddButton(targets) {
  const tab = await activeTab();
  const already = tab && String(tab.id) in targets;
  addEl.textContent = already ? "Update interval" : "Refresh this Tab";
}

// --- actions ---

async function commitIntervalFields() {
  const { minutes, seconds, total } = readInterval();
  minutesEl.value = minutes;
  secondsEl.value = seconds;
  await chrome.storage.local.set({ minutes, seconds });
  highlightActivePreset(total);
  return { minutes, seconds, total };
}

async function addOrUpdate() {
  const { minutes, seconds, total } = await commitIntervalFields();
  if (total < MIN_TOTAL_SECONDS) {
    statusEl.textContent = `Minimum interval is ${MIN_TOTAL_SECONDS} seconds.`;
    return;
  }
  const tab = await activeTab();
  if (!tab) return;
  if (PROTECTED_URL.test(tab.url || "")) {
    statusEl.textContent = "Cannot refresh this page.";
    return;
  }
  statusEl.textContent = "";
  await chrome.runtime.sendMessage({
    type: "arm",
    tabId: tab.id,
    totalSeconds: total,
    tabTitle: tab.title || "",
    windowId: tab.windowId,
    minutes,
    seconds,
  });
  await renderList();
}

async function stopTarget(tabId) {
  await chrome.runtime.sendMessage({ type: "disarm", tabId });
  await renderList();
}

async function jumpToTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
    window.close();
  } catch {
    await stopTarget(tabId);
  }
}

async function applyPreset(totalSeconds) {
  minutesEl.value = Math.floor(totalSeconds / 60);
  secondsEl.value = totalSeconds % 60;
  await commitIntervalFields();
  await updateAddButton((await chrome.storage.local.get({ targets: {} })).targets);
}

function blockNonInteger(e) {
  // block decimal point, exponent, sign — restrict to whole numbers only
  if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
}

// --- wiring ---

addEl.addEventListener("click", addOrUpdate);
themeToggleEl.addEventListener("click", toggleTheme);

// chrome.permissions.request must run inside the user gesture, before any await.
preserveScrollEl.addEventListener("change", async () => {
  if (preserveScrollEl.checked) {
    const granted = await chrome.permissions.request({ origins: SCROLL_ORIGINS });
    if (!granted) {
      preserveScrollEl.checked = false;
      statusEl.textContent = "Scroll preservation needs access to your pages.";
      return;
    }
    statusEl.textContent = "";
    await chrome.storage.local.set({ preserveScroll: true });
  } else {
    await chrome.storage.local.set({ preserveScroll: false });
    await chrome.permissions.remove({ origins: SCROLL_ORIGINS }); // tidy up the grant
  }
});

for (const el of [minutesEl, secondsEl]) {
  el.addEventListener("change", commitIntervalFields);
  el.addEventListener("keydown", (e) => {
    blockNonInteger(e);
    if (e.key === "Enter") {
      e.preventDefault();
      commitIntervalFields();
    }
  });
}

presetsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".preset-btn");
  if (!btn) return;
  const total = Number(btn.dataset.seconds);
  if (Number.isFinite(total) && total > 0) applyPreset(total);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.targets) renderList();
});

async function loadPreserveScroll() {
  const { preserveScroll } = await chrome.storage.local.get({ preserveScroll: false });
  // Reflect the real grant — the user may have revoked the host permission in settings.
  const granted = preserveScroll && (await chrome.permissions.contains({ origins: SCROLL_ORIGINS }));
  preserveScrollEl.checked = granted;
  if (preserveScroll && !granted) await chrome.storage.local.set({ preserveScroll: false });
}

async function load() {
  const { minutes, seconds } = await chrome.storage.local.get({ minutes: 15, seconds: 0 });
  minutesEl.value = minutes;
  secondsEl.value = seconds;
  highlightActivePreset(minutes * 60 + seconds);
  await loadPreserveScroll();
  await renderList();
}

loadTheme();
load();
