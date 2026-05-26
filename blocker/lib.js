// Pure, dependency-free helpers shared by popup.js, background.js, blocked.js,
// and options.js. No DOM, no chrome APIs — unit-testable headless with node:test.

// Top-level navigations to these schemes are never blocked (the New Tab page,
// settings, extension pages, local files, etc.). Only http/https is gated.
export const PROTECTED_URL =
  /^(chrome|edge|about|chrome-extension|moz-extension|chrome-search|chrome-untrusted|view-source|devtools|file|data):/i;

// Registrar suffixes where the registrable ("base") domain needs three labels,
// e.g. bbc.co.uk → bbc.co.uk, not co.uk. Not the full Public Suffix List (too
// large to vendor for v0.1) — just the common multi-part TLDs people hit.
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au",
  "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "com.br", "com.cn", "com.mx", "com.tr", "com.sg", "com.hk", "com.tw", "com.ar", "com.co",
  "co.in", "co.za", "co.kr", "co.il", "com.sa", "com.ua", "com.pl", "co.id", "co.th",
]);

export function isHttpUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

// Hostname of an http(s) URL, lower-cased; null for anything else (or unparsable).
export function hostFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

// The registrable base domain of a hostname (eTLD+1), e.g.
//   app.example.com   → example.com
//   www.bbc.co.uk     → bbc.co.uk
//   localhost         → localhost
//   127.0.0.1         → 127.0.0.1   (IPs/IPv6 returned as-is)
export function baseDomain(hostname) {
  if (!hostname) return null;
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h) return null;
  if (h === "localhost") return h;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return h; // IPv4 / IPv6
  const labels = h.split(".");
  if (labels.length <= 2) return h;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

// Normalize free-form user input (a URL, host, or bare domain) to a base domain
// suitable for the allowlist. Returns null if nothing usable.
export function normalizeDomain(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) {
    const host = hostFromUrl(s);
    if (!host) return null;
    s = host;
  } else {
    s = s.split("/")[0].split("?")[0].split("#")[0]; // strip any path/query/hash
  }
  s = s.replace(/^www\./, "").replace(/:\d+$/, ""); // drop leading www. and :port
  if (!s) return null;
  if (s !== "localhost" && !s.includes(".")) return null; // reject bare words
  return baseDomain(s);
}

// Does `host` fall under any allowlisted base domain (exact or a subdomain)?
export function domainAllowed(host, allowed) {
  if (!host) return false;
  const h = host.toLowerCase();
  return allowed.some((d) => h === d || h.endsWith("." + d));
}

// An allow entry is a string: a base domain ("example.com") that permits the
// domain and all its subdomains, optionally narrowed by a path prefix
// ("example.com/exam" permits only URLs whose path is /exam or under it). Split
// it into { base, path } ("" path = whole site).
export function parseRule(rule) {
  if (!rule) return null;
  const s = String(rule).trim().toLowerCase();
  if (!s) return null;
  const slash = s.indexOf("/");
  const base = slash === -1 ? s : s.slice(0, slash);
  if (!base) return null;
  const path = slash === -1 ? "" : s.slice(slash).replace(/\/+$/, "");
  return { base, path };
}

// Normalize free-form input (URL / host / "host/path") to a canonical allow
// entry — base domain, plus a tidy path prefix if one was given. Null if junk.
export function normalizeRule(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) {
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      s = u.host + u.pathname;
    } catch {
      return null;
    }
  }
  const slash = s.indexOf("/");
  const host = (slash === -1 ? s : s.slice(0, slash)).replace(/^www\./, "").replace(/:\d+$/, "");
  if (!host || (host !== "localhost" && !host.includes("."))) return null;
  const base = baseDomain(host);
  if (!base) return null;
  const path = (slash === -1 ? "" : s.slice(slash)).split("?")[0].split("#")[0].replace(/\/+$/, "");
  return path && path !== "" ? base + path : base;
}

// Does `url` satisfy a single allow rule? Host must equal the rule's base domain
// or be a subdomain of it; when the rule has a path prefix, the URL's path must
// equal it or sit beneath it (so /exam matches /exam and /exam/q1, not /examine).
export function ruleMatches(url, rule) {
  const p = parseRule(rule);
  if (!p) return false;
  const host = hostFromUrl(url);
  if (!host) return false;
  if (host !== p.base && !host.endsWith("." + p.base)) return false;
  if (!p.path) return true;
  let path;
  try {
    path = new URL(url).pathname.toLowerCase().replace(/\/+$/, "") || "/";
  } catch {
    return false;
  }
  return path === p.path || path.startsWith(p.path + "/");
}

// The core decision: should a top-frame navigation to `url` be blocked, given
// the allowlist and whether blocking is active? Non-http(s) is always allowed.
export function shouldBlock(url, allowed, blocking) {
  if (!blocking) return false;
  if (!isHttpUrl(url)) return false;
  const host = hostFromUrl(url);
  if (!host) return false;
  return !allowed.some((rule) => ruleMatches(url, rule));
}

// Add a base domain to the list (dedup, sorted); returns a new array.
export function addDomain(allowed, domain) {
  if (!domain) return allowed.slice();
  if (allowed.includes(domain)) return allowed.slice();
  return [...allowed, domain].sort();
}

// Remove a domain; returns a new array.
export function removeDomain(allowed, domain) {
  return allowed.filter((d) => d !== domain);
}

// The effective allowlist: the admin-pushed (policy / managed-storage) sites
// always apply; the user's own list is unioned on top unless the admin has
// locked it. Deduped + sorted. Used by both the enforcer and the popup.
export function effectiveAllowed(managedSites, userSites, lockAllowlist = false) {
  const managed = (managedSites || []).map((d) => String(d).toLowerCase());
  const user = lockAllowlist ? [] : userSites || [];
  return [...new Set([...managed, ...user])].sort();
}

// --- declarativeNetRequest enforcement ---------------------------------------
// The network-layer engine that enforces the allowlist *before* a page loads:
// no service-worker race, and it covers iframes too. buildDnrRules() turns the
// effective allowlist into a dynamic rule set with two parts:
//   • a catch-all (priority 1) that redirects every disallowed top frame to the
//     block page and hard-blocks disallowed iframes;
//   • one higher-priority `allow` rule (priority 2) per allowed site/path, so
//     approved destinations pass straight through.
// Only http/https is matched — the "|http" anchor also keeps the extension's own
// pages (incl. the block page itself) from matching, so the redirect can't loop.
// data: bypasses and already-open tabs are handled by the webNavigation backstop
// in background.js. Reserved rule ids 1–2; allow rules start at 100.
const DNR_REDIRECT_ID = 1;
const DNR_BLOCK_IFRAME_ID = 2;
const DNR_ALLOW_BASE_ID = 100;

// Escape a string for safe literal use inside an RE2 regexFilter. (Forward slash
// isn't an RE2 metacharacter, so it's left alone — escaping it errors in RE2.)
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// RE2 regexFilter for a path-scoped rule: the base domain or any subdomain, an
// optional port, the exact path prefix, then a boundary (/ ? # or end-of-URL) —
// so "example.com/exam" matches /exam and /exam/q1 but not /examine. Mirrors
// ruleMatches() so the DNR layer and the JS backstop agree.
export function ruleRegexFilter({ base, path }) {
  const host = `(?:[a-z0-9-]+\\.)*${escapeRegExp(base)}`;
  return `^https?://${host}(?::\\d+)?${escapeRegExp(path)}(?:[/?#]|$)`;
}

// A hostname safe to hand to DNR's `requestDomains` (lowercase DNS labels). An IP
// literal, IPv6 (colons), or anything else unusual is matched with a regexFilter
// instead — so a single odd allow entry can never produce a condition DNR would
// reject and throw on (which would drop the whole rule set).
const DNS_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// The DNR condition for one parsed allow rule. requestDomains (matches the base
// and its subdomains) for a plain hostname; a regexFilter for path-scoped rules
// and for hosts requestDomains might reject. Always a valid, accepted condition.
export function dnrCondition(p) {
  if (!p.path && DNS_HOST.test(p.base) && !IPV4.test(p.base)) {
    return { requestDomains: [p.base], resourceTypes: ["main_frame", "sub_frame"] };
  }
  return {
    regexFilter: ruleRegexFilter(p),
    isUrlFilterCaseSensitive: false,
    resourceTypes: ["main_frame", "sub_frame"],
  };
}

// Build the declarativeNetRequest dynamic rule set enforcing `allowed`. Pass an
// empty allowlist to still get the catch-all (everything blocked); the caller
// passes [] rules entirely when blocking is off. Junk entries (parseRule → null)
// are skipped; every other entry yields a valid condition (see dnrCondition).
export function buildDnrRules(allowed, { blockPath = "/blocked.html" } = {}) {
  const rules = [
    {
      id: DNR_REDIRECT_ID,
      priority: 1,
      action: { type: "redirect", redirect: { extensionPath: blockPath } },
      condition: { urlFilter: "|http", resourceTypes: ["main_frame"] },
    },
    {
      id: DNR_BLOCK_IFRAME_ID,
      priority: 1,
      action: { type: "block" },
      condition: { urlFilter: "|http", resourceTypes: ["sub_frame"] },
    },
  ];
  let id = DNR_ALLOW_BASE_ID;
  for (const rule of allowed || []) {
    const p = parseRule(rule);
    if (!p) continue;
    rules.push({ id: id++, priority: 2, action: { type: "allow" }, condition: dnrCondition(p) });
  }
  return rules;
}

// Build a Windows .reg file that locks Chrome to `allowed` on a managed machine,
// generated from the current in-extension allowlist so an admin doesn't have to
// hand-maintain it. Two layers: the native Chrome URLAllowlist (pair with
// URLBlocklist = ["*"]), and Blocker's own managed config (forceBlocking +
// lockAllowlist + allowedSites) for the running extension `extId`. Pure string
// builder; the Options page writes the result to a download. CRLF + the
// "Version 5.00" header are what regedit expects.
export function buildPolicyReg(allowed, extId, dateStr = "") {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const numbered = (items) => items.map((v, i) => `"${i + 1}"="${esc(v)}"`).join("\r\n");
  const sites = (allowed || []).filter(Boolean);
  const ext = `HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\3rdparty\\extensions\\${extId}\\policy`;
  return (
    [
      "Windows Registry Editor Version 5.00",
      "",
      `; Generated by Blocker${dateStr ? " on " + dateStr : ""} from the current allowlist.`,
      '; Layer 1 — native Chrome allowlist. Pair with URLBlocklist = ["*"] (see chrome-kiosk.reg).',
      "[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\URLAllowlist]",
      numbered(["chrome://newtab", ...sites]),
      "",
      `; Layer 2 — Blocker's managed config (extension ${extId}).`,
      `[${ext}]`,
      '"forceBlocking"=dword:00000001',
      '"lockAllowlist"=dword:00000001',
      "",
      `[${ext}\\allowedSites]`,
      numbered(sites),
      "",
    ].join("\r\n")
  );
}
