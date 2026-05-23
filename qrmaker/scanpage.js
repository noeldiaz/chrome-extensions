// Injected into the active tab (right after vendor/jsqr.js, sharing its isolated
// world so the jsQR global is visible) to find and decode every QR code rendered
// on the page. Returns the results to the caller. The 256KB jsQR payload is why
// this runs on demand via scripting.executeScript, not as a declared content
// script. Cross-origin images without CORS taint the canvas and are skipped.
(() => {
  const MIN = 40; // px; skip favicon-sized graphics that can't hold a QR
  const CAP = 1024; // downscale the long edge before decoding (jsQR is slow on huge images)
  const MAX_ELEMENTS = 400; // bound the work on image-heavy pages
  const seen = new Set();
  const results = [];
  let tainted = 0;
  let scanned = 0;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function tryDecode(el, w, h, src) {
    if (!w || !h || w < MIN || h < MIN || scanned >= MAX_ELEMENTS) return;
    scanned++;
    const scale = Math.min(1, CAP / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    canvas.width = cw;
    canvas.height = ch;
    try {
      ctx.drawImage(el, 0, 0, cw, ch);
      const { data } = ctx.getImageData(0, 0, cw, ch);
      const hit = jsQR(data, cw, ch);
      if (hit?.data && !seen.has(hit.data)) {
        seen.add(hit.data);
        results.push({ text: hit.data, src: src || null });
      }
    } catch {
      tainted++; // cross-origin image without CORS — its pixels are unreadable
    }
  }

  for (const img of document.images) {
    tryDecode(img, img.naturalWidth, img.naturalHeight, img.currentSrc || img.src);
  }
  for (const cv of document.querySelectorAll("canvas")) {
    tryDecode(cv, cv.width, cv.height, null);
  }
  return { results, tainted, scanned };
})();
