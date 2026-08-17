import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const background = await readFile(new URL("src/background/service-worker.js", root), "utf8");
const content = [
  await readFile(new URL("src/content/arxiv.js", root), "utf8"),
  await readFile(new URL("src/content/research-sites.js", root), "utf8"),
].join("\n");
const privacy = await readFile(new URL("PRIVACY.md", root), "utf8");

test("the extension requests no broad browsing or identity capabilities", () => {
  const declared = [...(manifest.permissions || []), ...(manifest.optional_permissions || [])];
  for (const permission of ["tabs", "history", "cookies", "identity", "clipboardRead", "scripting"]) {
    assert.ok(!declared.includes(permission), `unexpected ${permission} permission`);
  }
  const sites = manifest.content_scripts.flatMap((script) => script.matches);
  assert.ok(sites.every((site) => site.startsWith("https://")));
  assert.ok(sites.every((site) => !site.includes("*://") && !site.includes("<all_urls>")));
});

test("research-site scripts perform local matching only", () => {
  assert.doesNotMatch(content, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(content, /storage\.local|openAlexApiKey|api_key/);
  assert.doesNotMatch(content, /\.innerHTML\s*=|\beval\s*\(|new Function/);
});

test("the API key is hidden from content scripts and privacy handling is disclosed", () => {
  assert.match(background, /storage\.local\.setAccessLevel/);
  assert.match(background, /TRUSTED_CONTEXTS/);
  assert.match(privacy, /visible paper titles and scholarly identifiers/i);
  assert.match(privacy, /not an encrypted secret vault/i);
  assert.match(privacy, /optional `notifications`/i);
  assert.match(privacy, /Limited Use statement/i);
});
