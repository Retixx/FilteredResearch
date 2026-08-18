import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const background = await readFile(new URL("src/background/service-worker.js", root), "utf8");
const privacy = await readFile(new URL("PRIVACY.md", root), "utf8");

test("the extension requests no broad browsing or identity capabilities", () => {
  const declared = [...(manifest.permissions || []), ...(manifest.optional_permissions || [])];
  for (const permission of ["tabs", "history", "cookies", "identity", "clipboardRead", "scripting"]) {
    assert.ok(!declared.includes(permission), `unexpected ${permission} permission`);
  }
  assert.ok(manifest.host_permissions.every((host) => host.startsWith("https://")));
  assert.ok(manifest.host_permissions.every((host) => !host.includes("*://") && !host.includes("<all_urls>")));
});

test("the extension reads no web page at all", () => {
  // Page highlighting was removed in v0.8.0: nothing is injected anywhere, so
  // ordinary browsing never runs extension code.
  assert.ok(!manifest.content_scripts, "no content scripts may be declared");
  assert.ok(!JSON.stringify(manifest).includes("content_scripts"));
  for (const gone of ["SCREEN_SITE_ITEMS", "GET_SITE_MATCHES", "GET_ARXIV_SCORES", "SCORE_ARXIV_PAGE"]) {
    assert.ok(!background.includes(gone), `${gone} should no longer exist`);
  }
});

test("the API key is hidden from other contexts and privacy handling is disclosed", () => {
  assert.match(background, /storage\.local\.setAccessLevel/);
  assert.match(background, /TRUSTED_CONTEXTS/);
  assert.match(privacy, /not an encrypted secret vault/i);
  assert.match(privacy, /optional `notifications`/i);
  assert.match(privacy, /Limited Use statement/i);
});
