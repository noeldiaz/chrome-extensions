import { test } from "node:test";
import assert from "node:assert/strict";
import { isShareableUrl, ellipsize, downloadFilename } from "../lib.js";

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

test("downloadFilename builds a host + timestamp name", () => {
  const when = new Date(2026, 4, 23, 14, 15, 0); // 2026-05-23 14:15:00
  assert.equal(
    downloadFilename("https://example.com/path?q=1", "png", when),
    "qr-example.com-20260523-141500.png",
  );
});

test("downloadFilename maps jpeg to a .jpg extension", () => {
  const when = new Date(2026, 0, 2, 3, 4, 5);
  assert.equal(downloadFilename("https://a.co", "jpeg", when), "qr-a.co-20260102-030405.jpg");
});

test("downloadFilename keeps svg and falls back when there's no host", () => {
  const when = new Date(2026, 4, 23, 14, 15, 0);
  assert.equal(downloadFilename("https://sub.site.org", "svg", when), "qr-sub.site.org-20260523-141500.svg");
  assert.equal(downloadFilename("not a url", "png", when), "qr-code-20260523-141500.png");
});
