import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/sidepanel/sidepanel.html", import.meta.url), "utf8");

test("discovery has no alarm, startup, settings-save, or depth-change trigger", () => {
  assert.doesNotMatch(worker, /chrome\.alarms/);
  assert.match(worker, /case "SETTINGS_CHANGED":[\s\S]*?discoveryStarted: false/);
  assert.match(worker, /case "SET_MAX_TIME_FRAME":[\s\S]*?discoveryStarted: false/);
  assert.doesNotMatch(worker.match(/chrome\.runtime\.onInstalled[\s\S]*?\n\}\);/)?.[0] || "", /refresh\(/);
  assert.doesNotMatch(worker.match(/chrome\.runtime\.onStartup[\s\S]*?\n\}\);/)?.[0] || "", /refresh\(/);
});

test("both timeframe message spellings are accepted and depth modes are labeled", () => {
  assert.match(worker, /case "SET_MAX_TIME_FRAME":\s*case "SET_MAX_TIMEFRAME":/);
  for (const label of ["1 month · Regular", "3 months · Moderate", "6 months · Deep", "1 year · Extreme"]) {
    assert.ok(panel.includes(label), `missing depth label: ${label}`);
  }
});
