import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isShareableUrl,
  ellipsize,
  downloadFilename,
  clamp,
  degToRad,
  originPattern,
  cardLayout,
} from "../lib.js";

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

test("clamp keeps values within range and handles junk", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp("7", 0, 10), 7);
  assert.equal(clamp("nope", 4, 10), 4);
});

test("degToRad converts degrees to radians", () => {
  assert.equal(degToRad(0), 0);
  assert.equal(degToRad(180), Math.PI);
  assert.equal(degToRad("90"), Math.PI / 2);
  assert.equal(degToRad("bad"), 0);
});

test("originPattern builds a host match pattern for http(s)", () => {
  assert.equal(originPattern("https://example.com/a/b?x=1"), "https://example.com/*");
  assert.equal(originPattern("http://sub.host.org:8080/p"), "http://sub.host.org:8080/*");
});

test("originPattern returns null for non-http(s) and junk", () => {
  assert.equal(originPattern("data:image/png;base64,AAAA"), null);
  assert.equal(originPattern("blob:https://x/abc"), null);
  assert.equal(originPattern("chrome://flags"), null);
  assert.equal(originPattern("not a url"), null);
});

test("cardLayout frames the QR with padding and a quiet-zone tile", () => {
  const z = cardLayout(512, 0);
  assert.equal(z.width, z.tile + z.pad * 2);
  assert.equal(z.height, z.pad * 2 + z.tile); // no caption block
  assert.ok(z.tile > 512); // tile adds a white quiet zone around the code
  assert.equal(z.captionH, 0);
});

test("cardLayout adds height per caption line", () => {
  const none = cardLayout(512, 0);
  const two = cardLayout(512, 2);
  assert.ok(two.height > none.height);
  assert.equal(two.captionH, 2 * two.lineH + two.gap);
  assert.equal(two.height, two.pad + two.captionH + two.tile + two.pad);
});

test("cardLayout clamps the size to the export range", () => {
  assert.equal(cardLayout(99999, 0).S, 1000);
  assert.equal(cardLayout(1, 0).S, 100);
  assert.equal(cardLayout("nope", 0).S, 100);
});
