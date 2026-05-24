// Build-time feature flags. This committed copy is the Chromium default so the
// extension loads unpacked for dev without a build step. build.mjs overwrites it
// per target — e.g. the Safari build turns both flags off.
export const TARGET = "chrome";
export const FEATURES = { fullscreenCapture: true, nativeDownloads: true };
