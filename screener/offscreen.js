// Runs inside the offscreen document. Captures one PNG frame of a screen or
// window via getDisplayMedia (the SW has no DOM, and a desktopCapture streamId
// can't be consumed here). The SW just triggers it and stores the result.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return false;
  if (msg.type === "grabFrame") {
    grabFrame().then(
      (dataUrl) => sendResponse({ ok: true, dataUrl }),
      // NotAllowedError = the user dismissed/declined the picker — treat as a
      // quiet cancel rather than an error to surface.
      (e) => sendResponse({ ok: false, cancelled: e?.name === "NotAllowedError", error: String(e?.message || e) }),
    );
    return true; // async response
  }
  return false;
});

// A desktopCapture streamId can't be consumed in an offscreen document
// (Chrome: "Error starting tab capture"). getDisplayMedia is the supported path
// here — it shows the native screen/window picker itself.
async function grabFrame() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const track = stream.getVideoTracks()[0];
  try {
    // Prefer ImageCapture: it reads the track directly. Offscreen documents
    // aren't painted, so requestAnimationFrame (the usual video->canvas path)
    // is unreliable here.
    if (typeof ImageCapture !== "undefined") {
      try {
        const bitmap = await new ImageCapture(track).grabFrame();
        return await bitmapToDataUrl(bitmap);
      } catch {
        // fall through to the video path
      }
    }
    return await videoGrab(stream);
  } finally {
    for (const t of stream.getTracks()) t.stop();
  }
}

async function videoGrab(stream) {
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  // Poll instead of rAF — this document isn't being rendered.
  await waitFor(() => video.videoWidth > 0 && video.readyState >= 2, 3000);
  const w = video.videoWidth || 1;
  const h = video.videoHeight || 1;
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);
  video.pause();
  return canvasToDataUrl(canvas);
}

async function bitmapToDataUrl(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvasToDataUrl(canvas);
}

async function canvasToDataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function waitFor(cond, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Timed out waiting for a video frame."));
      setTimeout(tick, 30);
    };
    tick();
  });
}
