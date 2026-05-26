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

test("addDomain dedups and sorts; removeDomain filters", () => {
  assert.deepEqual(addDomain([], "b.com"), ["b.com"]);
  assert.deepEqual(addDomain(["b.com"], "a.com"), ["a.com", "b.com"]);
  assert.deepEqual(addDomain(["a.com"], "a.com"), ["a.com"]);
  assert.deepEqual(addDomain(["a.com"], ""), ["a.com"]);
  assert.deepEqual(removeDomain(["a.com", "b.com"], "a.com"), ["b.com"]);
  assert.deepEqual(removeDomain(["a.com"], "x.com"), ["a.com"]);
});
