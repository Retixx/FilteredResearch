import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("release versions stay aligned", () => {
  assert.equal(manifest.version, "0.3.0");
  assert.equal(manifest.version, packageJson.version);
});

test("manifest is MV3 and has only scoped host access", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, "116");
  assert.deepEqual(manifest.host_permissions, ["https://api.openalex.org/*"]);
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("alarms"));
  assert.ok(!manifest.permissions.includes("notifications"));
  assert.deepEqual(manifest.optional_permissions, ["notifications"]);
  assert.ok(!manifest.permissions.includes("tabs"));
  assert.ok(!manifest.permissions.includes("history"));
  const matches = manifest.content_scripts.flatMap((script) => script.matches);
  assert.ok(!matches.includes("<all_urls>"));
  assert.ok(!matches.includes("*://*/*"));
});

test("manifest points to bundled local code", () => {
  assert.equal(manifest.background.type, "module");
  assert.ok(!JSON.stringify(manifest).includes("http://"));
  assert.ok(!JSON.stringify(manifest).includes("*://*/*"));
});

test("declared icon files exist", async () => {
  await Promise.all(
    Object.values(manifest.icons).map((path) =>
      access(new URL(`../${path}`, import.meta.url)),
    ),
  );
});
