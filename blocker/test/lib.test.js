import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PROTECTED_URL,
  isHttpUrl,
  hostFromUrl,
  baseDomain,
  normalizeDomain,
  domainAllowed,
  shouldBlock,
  addDomain,
  removeDomain,
  effectiveAllowed,
  parseRule,
  normalizeRule,
  ruleMatches,
  ruleRegexFilter,
  buildDnrRules,
} from "../lib.js";

test("isHttpUrl matches only http/https", () => {
  assert.equal(isHttpUrl("http://a.com"), true);
  assert.equal(isHttpUrl("https://a.com/x?y#z"), true);
  assert.equal(isHttpUrl("chrome://extensions"), false);
  assert.equal(isHttpUrl("about:blank"), false);
  assert.equal(isHttpUrl(""), false);
  assert.equal(isHttpUrl(undefined), false);
});

test("PROTECTED_URL flags non-web schemes", () => {
  for (const u of ["chrome://x", "about:blank", "chrome-extension://id/p", "file:///x", "view-source:http://a"]) {
    assert.equal(PROTECTED_URL.test(u), true, u);
  }
  assert.equal(PROTECTED_URL.test("https://example.com"), false);
});

test("hostFromUrl returns lowercased host for http(s) only", () => {
  assert.equal(hostFromUrl("https://Example.COM/path"), "example.com");
  assert.equal(hostFromUrl("http://sub.Example.com:8080/x"), "sub.example.com");
  assert.equal(hostFromUrl("chrome://extensions"), null);
  assert.equal(hostFromUrl("not a url"), null);
  // parseable URL but a non-web scheme is rejected (protocol guard)
  assert.equal(hostFromUrl("ftp://files.example.com/x"), null);
  assert.equal(hostFromUrl(""), null);
});

test("baseDomain reduces to the registrable domain", () => {
  assert.equal(baseDomain("example.com"), "example.com");
  assert.equal(baseDomain("www.example.com"), "example.com");
  assert.equal(baseDomain("a.b.c.example.com"), "example.com");
  assert.equal(baseDomain("EXAMPLE.com"), "example.com");
  assert.equal(baseDomain("example.com."), "example.com");
});

test("baseDomain handles common multi-part TLDs", () => {
  assert.equal(baseDomain("www.bbc.co.uk"), "bbc.co.uk");
  assert.equal(baseDomain("shop.example.com.au"), "example.com.au");
  assert.equal(baseDomain("foo.bar.co.jp"), "bar.co.jp");
});

test("baseDomain passes through IPs and localhost", () => {
  assert.equal(baseDomain("127.0.0.1"), "127.0.0.1");
  assert.equal(baseDomain("localhost"), "localhost");
  assert.equal(baseDomain("::1"), "::1");
});

test("baseDomain returns null for empty/falsy input", () => {
  assert.equal(baseDomain(""), null);
  assert.equal(baseDomain(null), null);
  assert.equal(baseDomain(undefined), null);
  assert.equal(baseDomain("."), null); // trailing-dot strip leaves nothing
});

test("normalizeDomain accepts URLs, hosts, and bare domains", () => {
  assert.equal(normalizeDomain("https://www.Example.com/path?q=1"), "example.com");
  assert.equal(normalizeDomain("app.example.com"), "example.com");
  assert.equal(normalizeDomain("  Example.COM  "), "example.com");
  assert.equal(normalizeDomain("example.com:8443/x"), "example.com");
  assert.equal(normalizeDomain("www.bbc.co.uk"), "bbc.co.uk");
  assert.equal(normalizeDomain("localhost"), "localhost");
});

test("normalizeDomain rejects junk", () => {
  assert.equal(normalizeDomain(""), null);
  assert.equal(normalizeDomain("   "), null);
  assert.equal(normalizeDomain("notadomain"), null);
  assert.equal(normalizeDomain("chrome://x"), null);
});

test("domainAllowed matches exact and subdomains", () => {
  const allowed = ["example.com", "bbc.co.uk"];
  assert.equal(domainAllowed("example.com", allowed), true);
  assert.equal(domainAllowed("www.example.com", allowed), true);
  assert.equal(domainAllowed("a.b.example.com", allowed), true);
  assert.equal(domainAllowed("news.bbc.co.uk", allowed), true);
  assert.equal(domainAllowed("notexample.com", allowed), false);
  assert.equal(domainAllowed("example.com.evil.com", allowed), false);
  assert.equal(domainAllowed("", allowed), false);
});

test("parseRule splits host and path prefix", () => {
  assert.deepEqual(parseRule("example.com"), { base: "example.com", path: "" });
  assert.deepEqual(parseRule("example.com/exam"), { base: "example.com", path: "/exam" });
  assert.deepEqual(parseRule("example.com/exam/"), { base: "example.com", path: "/exam" });
  assert.equal(parseRule(""), null);
});

test("normalizeRule canonicalizes URLs, hosts, and host/path input", () => {
  assert.equal(normalizeRule("https://www.Example.com/Exam/?q=1"), "example.com/exam");
  assert.equal(normalizeRule("app.example.com"), "example.com");
  assert.equal(normalizeRule("example.com/"), "example.com");
  assert.equal(normalizeRule("bbc.co.uk/news"), "bbc.co.uk/news");
  assert.equal(normalizeRule("notadomain"), null);
  assert.equal(normalizeRule("ftp://x.com/a"), null);
});

test("ruleMatches honors subdomains and path prefixes", () => {
  assert.equal(ruleMatches("https://example.com/x", "example.com"), true);
  assert.equal(ruleMatches("https://sub.example.com/x", "example.com"), true);
  assert.equal(ruleMatches("https://example.com/exam", "example.com/exam"), true);
  assert.equal(ruleMatches("https://example.com/exam/q1", "example.com/exam"), true);
  assert.equal(ruleMatches("https://example.com/examine", "example.com/exam"), false);
  assert.equal(ruleMatches("https://example.com/other", "example.com/exam"), false);
  assert.equal(ruleMatches("https://other.com/", "example.com"), false);
  assert.equal(ruleMatches("chrome://x", "example.com"), false);
});

test("shouldBlock respects path-scoped allow rules", () => {
  const allowed = ["example.com/exam"];
  assert.equal(shouldBlock("https://example.com/exam/q1", allowed, true), false);
  assert.equal(shouldBlock("https://example.com/grades", allowed, true), true);
});

test("shouldBlock gates only disallowed http(s) top navigations", () => {
  const allowed = ["example.com"];
  assert.equal(shouldBlock("https://other.com", allowed, true), true);
  assert.equal(shouldBlock("https://example.com/x", allowed, true), false);
  assert.equal(shouldBlock("https://sub.example.com", allowed, true), false);
  // never block when off, non-http, or unparsable
  assert.equal(shouldBlock("https://other.com", allowed, false), false);
  assert.equal(shouldBlock("chrome://extensions", allowed, true), false);
  assert.equal(shouldBlock("about:blank", allowed, true), false);
  assert.equal(shouldBlock("", allowed, true), false);
});

test("effectiveAllowed unions managed + user, deduped, sorted, lowercased", () => {
  assert.deepEqual(effectiveAllowed(["B.com"], ["a.com"]), ["a.com", "b.com"]);
  assert.deepEqual(effectiveAllowed(["a.com"], ["a.com", "c.com"]), ["a.com", "c.com"]);
  assert.deepEqual(effectiveAllowed([], ["x.com"]), ["x.com"]);
  assert.deepEqual(effectiveAllowed(["x.com"], []), ["x.com"]);
});

test("effectiveAllowed ignores the user list when the allowlist is locked", () => {
  assert.deepEqual(effectiveAllowed(["school.edu"], ["games.com"], true), ["school.edu"]);
  assert.deepEqual(effectiveAllowed([], ["games.com"], true), []);
});

test("effectiveAllowed tolerates null/undefined inputs", () => {
  assert.deepEqual(effectiveAllowed(null, null), []);
  assert.deepEqual(effectiveAllowed(undefined, ["a.com"]), ["a.com"]);
});

test("ruleRegexFilter mirrors ruleMatches path semantics", () => {
  const re = new RegExp(ruleRegexFilter({ base: "example.com", path: "/exam" }), "i");
  assert.equal(re.test("https://example.com/exam"), true);
  assert.equal(re.test("https://example.com/exam/q1"), true);
  assert.equal(re.test("https://sub.example.com/exam?x=1"), true);
  assert.equal(re.test("http://example.com:8080/exam#a"), true);
  assert.equal(re.test("https://example.com/examine"), false); // boundary
  assert.equal(re.test("https://notexample.com/exam"), false); // sibling host
  assert.equal(re.test("https://example.com/other"), false);
});

test("ruleRegexFilter escapes regex metacharacters in base/path", () => {
  // a dot in the base must be literal, not "any char" (so a.b.com ≠ axb.com)
  const re = new RegExp(ruleRegexFilter({ base: "a.b.com", path: "" }), "i");
  assert.equal(re.test("https://a.b.com/"), true);
  assert.equal(re.test("https://axbxcom/"), false);
});

test("buildDnrRules emits a catch-all redirect + iframe block, then allows", () => {
  const rules = buildDnrRules(["example.com", "school.edu/exam"]);
  const redirect = rules.find((r) => r.action.type === "redirect");
  const block = rules.find((r) => r.action.type === "block");
  const allows = rules.filter((r) => r.action.type === "allow");

  // catch-all redirects top frames to the block page, hard-blocks iframes
  assert.equal(redirect.condition.resourceTypes[0], "main_frame");
  assert.equal(redirect.action.redirect.extensionPath, "/blocked.html");
  assert.deepEqual(block.condition.resourceTypes, ["sub_frame"]);
  // allow rules outrank the catch-all so approved sites pass through
  assert.ok(allows.every((r) => r.priority > redirect.priority));

  // base-domain rule uses requestDomains (matches subdomains); path rule a regex
  const base = allows.find((r) => r.condition.requestDomains);
  assert.deepEqual(base.condition.requestDomains, ["example.com"]);
  const path = allows.find((r) => r.condition.regexFilter);
  assert.ok(path.condition.regexFilter.includes("school\\.edu")); // dot escaped

  // ids are unique and stable across the set
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("buildDnrRules routes IP/odd hosts to a regexFilter (requestDomains-safe)", () => {
  // an IPv4 base must not be handed to requestDomains (DNR may reject it) —
  // it goes through a regexFilter that still matches the literal host
  const rules = buildDnrRules(["127.0.0.1", "localhost"]);
  const ip = rules.find((r) => r.condition.regexFilter && r.condition.regexFilter.includes("127"));
  assert.ok(ip, "IPv4 entry should use regexFilter");
  assert.ok(new RegExp(ip.condition.regexFilter, "i").test("http://127.0.0.1/page"));
  // a plain single-label host (localhost) is still fine for requestDomains
  const local = rules.find((r) => r.condition.requestDomains?.includes("localhost"));
  assert.ok(local, "localhost should use requestDomains");
});

test("buildDnrRules skips junk allow entries but keeps the catch-all", () => {
  const rules = buildDnrRules(["", null, "notadomain"]);
  // parseRule keeps "notadomain" (a bare host is a valid base), drops "" / null
  assert.equal(rules.filter((r) => r.action.type === "allow").length, 1);
  assert.ok(rules.some((r) => r.action.type === "redirect"));
});

test("addDomain dedups and sorts; removeDomain filters", () => {
  assert.deepEqual(addDomain([], "b.com"), ["b.com"]);
  assert.deepEqual(addDomain(["b.com"], "a.com"), ["a.com", "b.com"]);
  assert.deepEqual(addDomain(["a.com"], "a.com"), ["a.com"]);
  assert.deepEqual(addDomain(["a.com"], ""), ["a.com"]);
  assert.deepEqual(removeDomain(["a.com", "b.com"], "a.com"), ["b.com"]);
  assert.deepEqual(removeDomain(["a.com"], "x.com"), ["a.com"]);
});
