// Produces the exact archive to upload to the Chrome Web Store. The first
// submission is manual, so this has to be reproducible locally rather than only
// inside CI.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "dist", "filteredresearch-extension");
const target = resolve(root, "FilteredResearch-web-store.zip");

if (!existsSync(source)) {
  process.stderr.write("Run `npm run package` first: dist/filteredresearch-extension is missing.\n");
  process.exit(1);
}
rmSync(target, { force: true });

// PowerShell ships with every supported Windows and needs no extra tooling.
// The store requires manifest.json at the archive root, so the folder's
// children are compressed rather than the folder itself.
execFileSync(
  "powershell",
  ["-NoProfile", "-Command",
   `Get-ChildItem -LiteralPath '${source}' | Compress-Archive -DestinationPath '${target}' -Force`],
  { stdio: "inherit" },
);

// An archive with the folder nested inside it is rejected on upload, so this is
// verified rather than assumed.
const entries = execFileSync(
  "powershell",
  ["-NoProfile", "-Command",
   "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
   `[IO.Compression.ZipFile]::OpenRead('${target}').Entries | ForEach-Object { $_.FullName }`],
  { encoding: "utf8" },
).split(/\r?\n/).filter(Boolean);

if (!entries.includes("manifest.json")) {
  process.stderr.write(
    `manifest.json must sit at the archive root. Found instead:\n  ${entries.slice(0, 8).join("\n  ")}\n`,
  );
  process.exit(1);
}

const bytes = statSync(target).size;
process.stdout.write(
  `FilteredResearch-web-store.zip  ${(bytes / 1024).toFixed(1)} KB  ${entries.length} entries  manifest.json at root\n`,
);
