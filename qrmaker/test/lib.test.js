import { test } from "node:test";
import assert from "node:assert/strict";
import { isShareableUrl, ellipsize, qrLayout } from "../lib.js";

test("isShareableUrl accepts http and https", () => {
  assert.equal(isShareableUrl("http://example.com"), true);
  assert.equal(isShareableUrl("https://example.com/path?q=1#frag"), true);
});

test("isShareableUrl rejects non-web and invalid URLs", () => {
  assert.equal(isShareableUrl("chrome://settings"), false);
  assert.equal(isShareableUrl("chrome-extension://abc/popup.html"), false);
  assert.equal(isShareableUrl("about:blank"), false);
  assert.equal(isShareableUrl("file:///Users/me/page.html"), false);
  assert.equal(isShareableUrl("view-source:https://example.com"), false);
  assert.equal(isShareableUrl(""), false);
  assert.equal(isShareableUrl("not a url"), false);
  assert.equal(isShareableUrl(undefined), false);
});

test("ellipsize leaves short text untouched", () => {
  assert.equal(ellipsize("https://a.co", 72), "https://a.co");
  assert.equal(ellipsize("", 72), "");
  assert.equal(ellipsize(undefined, 72), "");
});

test("ellipsize middle-truncates long text to max length", () => {
  const url = "https://example.com/" + "a".repeat(200) + "/end";
  const out = ellipsize(url, 40);
  assert.equal(out.length, 40);
  assert.ok(out.includes("…"));
  assert.ok(out.startsWith("https://example.com"));
  assert.ok(out.endsWith("end"));
});

test("ellipsize handles tiny max", () => {
  assert.equal(ellipsize("abcdef", 1), "…");
});

test("qrLayout fits modules plus quiet zone inside the target", () => {
  const l = qrLayout(25, 240, 4); // total 33 modules
  assert.equal(l.total, 33);
  assert.equal(l.scale, 7); // floor(240/33)
  assert.equal(l.dimension, 231);
  assert.ok(l.dimension <= 240);
});

test("qrLayout never returns a scale below 1", () => {
  const l = qrLayout(177, 100, 4); // huge code, small target
  assert.equal(l.scale, 1);
  assert.equal(l.dimension, 185);
});
