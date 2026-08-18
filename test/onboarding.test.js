import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SETTINGS, normalizeSettings } from "../src/shared/defaults.js";

const client = await readFile(new URL("../src/shared/openalex.js", import.meta.url), "utf8");
const panelHtml = await readFile(new URL("../src/sidepanel/sidepanel.html", import.meta.url), "utf8");
const panelScript = await readFile(new URL("../src/sidepanel/sidepanel.js", import.meta.url), "utf8");
const optionsHtml = await readFile(new URL("../src/options/options.html", import.meta.url), "utf8");
const optionsScript = await readFile(new URL("../src/options/options.js", import.meta.url), "utf8");

test("no developer API key can ever be bundled", () => {
  // The publisher must not be able to pay for other people's usage: a key is
  // attached only when the user supplied one.
  assert.match(client, /if \(this\.apiKey\) url\.searchParams\.set\("api_key", this\.apiKey\)/);
  assert.match(client, /constructor\(\{ apiKey = ""/);
  // No literal key-looking default anywhere in the shipped source.
  for (const source of [client, panelScript, optionsScript]) {
    assert.doesNotMatch(source, /api_key\s*[:=]\s*["'][A-Za-z0-9_-]{8,}["']/);
  }
});

test("a first run without a key is framed as working, not broken", () => {
  // The empty state used to demand a key before the tool did anything.
  assert.ok(!panelHtml.includes("add your own OpenAlex key in settings"));
  assert.match(panelHtml, /works straight away without an API key/i);
  assert.doesNotMatch(panelScript, /Limited preview/);
  // The keyless notice leads with what was found, then what a key adds.
  const notice = panelScript.match(/Screened \$\{compactNumber\(coverage\.limitedRetrieved[^`]*/)?.[0] || "";
  assert.match(notice, /free OpenAlex key/);
  assert.ok(
    notice.indexOf("Screened") < notice.indexOf("free OpenAlex key"),
    "the result must be stated before the upsell",
  );
});

test("the key is presented as optional and free", () => {
  assert.match(optionsHtml, /optional &middot; free/);
  assert.match(optionsHtml, /works without a key/i);
  assert.match(optionsHtml, /openalex\.org\/settings\/api/);
});

test("a keyless pass samples enough to be worth reading", () => {
  // 500 was five requests and read as a teaser; this is still a trivial load on
  // the shared pool.
  assert.equal(DEFAULT_SETTINGS.broadSample, 1000);
  assert.equal(normalizeSettings({ broadSample: 5000 }).broadSample, 2000, "still bounded");
  assert.equal(normalizeSettings({ broadSample: 1 }).broadSample, 100, "still floored");
});

test("usage is reported in requests, not dollars", () => {
  // OpenAlex's standard API is free; a dollar figure implies a bill that does
  // not exist and deters installs.
  assert.ok(!optionsHtml.includes("free daily allowance"));
  assert.match(optionsHtml, /OpenAlex requests from this browser today/);
  assert.match(optionsScript, /requests\.toLocaleString\(\)/);
  assert.doesNotMatch(optionsScript, /\$\$\{cost\.toFixed/);
});

test("every request identifies the tool for OpenAlex's polite pool", async () => {
  const { CONTACT_EMAIL } = await import("../src/shared/openalex.js");
  // Anonymous traffic is throttled first, and keyless users are the ones who
  // would feel it, so the contact address is attached whether or not the user
  // has supplied a key of their own.
  assert.match(CONTACT_EMAIL, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
  assert.match(client, /url\.searchParams\.set\("mailto", CONTACT_EMAIL\);/);
  const requestBody = client.match(/async request\(endpoint, parameters\)[\s\S]*?for \(let attempt/)?.[0] || "";
  assert.ok(
    requestBody.indexOf('"mailto"') < requestBody.indexOf("this.apiKey"),
    "the tool is identified regardless of whether a user key exists",
  );
  // It is a contact for the software, so nothing about the user rides along.
  assert.doesNotMatch(client, /mailto[^\n]*(settings|user|profile|email\s*\|\|)/i);
});
