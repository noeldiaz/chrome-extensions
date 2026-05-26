// Verify each extension's copy of a shared module matches the canonical in
// shared/. Exits non-zero (listing the drift) so it can gate a build or CI.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(readFileSync(join(ROOT, "shared", "files.json"), "utf8"));

const drift = [];
for (const [file, exts] of Object.entries(map)) {
  const canon = readFileSync(join(ROOT, "shared", file));
  for (const ext of exts) {
    if (!canon.equals(readFileSync(join(ROOT, ext, file)))) drift.push(`${ext}/${file}`);
  }
}

if (drift.length) {
  console.error("shared drift — run `node tools/sync-shared.mjs`:\n  " + drift.join("\n  "));
  process.exit(1);
}
console.log("shared modules in sync");
