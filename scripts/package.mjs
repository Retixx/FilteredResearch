import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const destination = resolve(root, "dist", "filteredresearch-extension");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

for (const entry of [
  "manifest.json",
  "src",
  "assets",
  "LICENSE",
  "PRIVACY.md",
  "COMPLIANCE.md",
]) {
  await cp(resolve(root, entry), resolve(destination, entry), { recursive: true });
}

const manifestPath = resolve(destination, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(`Staged load-unpacked extension at ${destination}\n`);
