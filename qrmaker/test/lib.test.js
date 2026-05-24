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
  buildWifi,
  buildVCard,
  buildEmail,
  buildSms,
  buildTel,
  buildGeo,
  detectType,
  parseWifi,
  parseVCard,
  parseEmail,
  parseSms,
  parseTel,
  parseGeo,
  parseStructured,
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

// --- structured payload builders ---

test("buildWifi encodes the network and escapes reserved chars", () => {
  assert.equal(
    buildWifi({ ssid: "Home", password: "secret", encryption: "WPA" }),
    "WIFI:T:WPA;S:Home;P:secret;;",
  );
  assert.equal(buildWifi({ ssid: "Cafe;1", password: 'p:a"s' }), 'WIFI:T:WPA;S:Cafe\\;1;P:p\\:a\\"s;;');
  assert.equal(buildWifi({ ssid: "Net", hidden: true }), "WIFI:T:WPA;S:Net;H:true;;");
});

test("buildWifi drops the password for an open network and needs an SSID", () => {
  assert.equal(buildWifi({ ssid: "Open", password: "ignored", encryption: "nopass" }), "WIFI:T:nopass;S:Open;;");
  assert.equal(buildWifi({ ssid: "  ", password: "x" }), "");
  assert.equal(buildWifi({}), "");
});

test("buildVCard emits vCard 3.0 with the supplied fields", () => {
  const out = buildVCard({ firstName: "Ada", lastName: "Lovelace", email: "ada@x.io", org: "Analytical" });
  assert.ok(out.startsWith("BEGIN:VCARD\nVERSION:3.0\n"));
  assert.ok(out.includes("N:Lovelace;Ada;;;"));
  assert.ok(out.includes("FN:Ada Lovelace"));
  assert.ok(out.includes("EMAIL:ada@x.io"));
  assert.ok(out.includes("ORG:Analytical"));
  assert.ok(out.endsWith("END:VCARD"));
});

test("buildVCard falls back to org for FN and needs at least one key field", () => {
  const orgOnly = buildVCard({ org: "ACME, Inc." });
  assert.ok(orgOnly.includes("FN:ACME\\, Inc."));
  assert.ok(orgOnly.includes("ORG:ACME\\, Inc."));
  assert.equal(buildVCard({ title: "Engineer", url: "https://x.io" }), "");
  assert.equal(buildVCard({}), "");
});

test("buildVCard adds ADR and NOTE when those fields are set", () => {
  const out = buildVCard({
    firstName: "Ada",
    street: "1 Main St",
    city: "Townsville",
    region: "CA",
    zip: "90001",
    country: "USA",
    note: "Met at the QR conf",
  });
  assert.ok(out.includes("ADR:;;1 Main St;Townsville;CA;90001;USA"));
  assert.ok(out.includes("NOTE:Met at the QR conf"));
});

test("buildVCard emits a partial ADR and still needs a key field", () => {
  const out = buildVCard({ email: "a@b.io", city: "Townsville" });
  assert.ok(out.includes("ADR:;;;Townsville;;;"));
  // address / note alone (no name/org/phone/email) is not a valid card
  assert.equal(buildVCard({ city: "Nowhere", note: "x" }), "");
});

test("buildEmail builds a percent-encoded mailto", () => {
  assert.equal(buildEmail({ to: "a@b.io" }), "mailto:a@b.io");
  assert.equal(
    buildEmail({ to: "a@b.io", subject: "Hi there", body: "Line one" }),
    "mailto:a@b.io?subject=Hi%20there&body=Line%20one",
  );
  assert.equal(buildEmail({ subject: "no recipient" }), "");
});

test("buildSms uses SMSTO with an optional message", () => {
  assert.equal(buildSms({ number: "+15551234" }), "SMSTO:+15551234");
  assert.equal(buildSms({ number: "+15551234", message: "hi" }), "SMSTO:+15551234:hi");
  assert.equal(buildSms({ message: "no number" }), "");
});

test("buildTel and buildGeo encode or reject", () => {
  assert.equal(buildTel({ number: "+15551234" }), "tel:+15551234");
  assert.equal(buildTel({}), "");
  assert.equal(buildGeo({ lat: "37.77", lng: "-122.41" }), "geo:37.77,-122.41");
  assert.equal(buildGeo({ lat: "nope", lng: "1" }), "");
  assert.equal(buildGeo({}), "");
});

// --- structured parsers (decode -> edit) ---

test("detectType recognizes each structured scheme", () => {
  assert.equal(detectType("WIFI:T:WPA;S:x;;"), "wifi");
  assert.equal(detectType("BEGIN:VCARD\nEND:VCARD"), "vcard");
  assert.equal(detectType("mailto:a@b.io"), "email");
  assert.equal(detectType("SMSTO:123:hi"), "sms");
  assert.equal(detectType("tel:123"), "tel");
  assert.equal(detectType("geo:1,2"), "geo");
  assert.equal(detectType("https://x.io"), "text");
});

test("parseWifi inverts buildWifi including escaping", () => {
  const f = { ssid: "Cafe;1", password: 'p:a"s', encryption: "WPA", hidden: true };
  assert.deepEqual(parseWifi(buildWifi(f)), f);
  assert.deepEqual(parseWifi("WIFI:T:nopass;S:Open;;"), {
    ssid: "Open",
    password: "",
    encryption: "nopass",
    hidden: false,
  });
});

test("parseVCard inverts buildVCard across all fields", () => {
  const f = {
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+1",
    email: "a@x.io",
    org: "ACME, Inc.",
    title: "Eng",
    url: "https://x.io",
    street: "1 Main St",
    city: "Town",
    region: "CA",
    zip: "90001",
    country: "USA",
    note: "hi\nthere",
  };
  assert.deepEqual(parseVCard(buildVCard(f)), f);
});

test("parseEmail / parseSms / parseTel / parseGeo invert their builders", () => {
  assert.deepEqual(parseEmail(buildEmail({ to: "a@b.io", subject: "Hi there", body: "Line one" })), {
    to: "a@b.io",
    subject: "Hi there",
    body: "Line one",
  });
  assert.deepEqual(parseSms(buildSms({ number: "+15551234", message: "hi" })), {
    number: "+15551234",
    message: "hi",
  });
  assert.deepEqual(parseTel(buildTel({ number: "+15551234" })), { number: "+15551234" });
  assert.deepEqual(parseGeo(buildGeo({ lat: "37.77", lng: "-122.41" })), { lat: "37.77", lng: "-122.41" });
});

test("parseStructured dispatches by kind", () => {
  assert.equal(parseStructured("wifi", "WIFI:T:WPA;S:Net;;").ssid, "Net");
  assert.equal(parseStructured("text", "anything"), null);
});
