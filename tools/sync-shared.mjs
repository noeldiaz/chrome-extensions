// Copy the canonical shared modules (shared/) into each extension that uses
// them. Run after editing anything in shared/. The per-extension copies are
// generated (committed so load-unpacked works without a build step). See
// shared/README.md.
import { readFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(readFileSync(join(ROOT, "shared", "files.json"), "utf8"));

let n = 0;
for (const [file, exts] of Object.entries(map)) {
  for (const ext of exts) {
    copyFileSync(join(ROOT, "shared", file), join(ROOT, ext, file));
    n++;
  }
}
console.log(`synced ${n} files from shared/`);
