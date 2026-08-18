import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { describeProgress, runRefresh } from "../src/shared/refresh-progress.js";

const worker = await readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
const panelScript = await readFile(new URL("../src/sidepanel/sidepanel.js", import.meta.url), "utf8");
const notificationsScript = await readFile(new URL("../src/notifications/notifications.js", import.meta.url), "utf8");
const optionsScript = await readFile(new URL("../src/options/options.js", import.meta.url), "utf8");

test("a pass is started without holding the message channel open", () => {
  // Awaiting the pass inside the listener failed with "a listener indicated an
  // asynchronous response by returning true, but the message channel closed
  // before a response was received" whenever the worker was torn down mid-pass.
  const handler = worker.match(/case "REFRESH":[\s\S]*?case "GET_REFRESH_STATE":[^\n]*\n[^\n]*/)?.[0] || "";
  assert.match(handler, /refresh\("manual"\)\.catch\(/);
  assert.doesNotMatch(handler, /return refresh\(/);
  assert.match(worker, /case "GET_REFRESH_STATE":/);
  for (const [name, source] of [["panel", panelScript], ["notifications", notificationsScript], ["options", optionsScript]]) {
    assert.match(source, /runRefresh\(send/, `${name} should watch progress`);
    assert.doesNotMatch(source, /await send\("REFRESH"\)/, `${name} still blocks on REFRESH`);
    assert.doesNotMatch(source, /await send\("REBUILD"\)/, `${name} still blocks on REBUILD`);
  }
});

test("runRefresh reports progress and returns the completed state", async () => {
  const states = [
    { status: "running", phase: "discovery", lane: "selected subfields", fetched: 100, total: 900, updatedAt: "t1" },
    { status: "running", phase: "scoring", fetched: 500, total: 900, updatedAt: "t2" },
    { status: "ready", candidatesFetched: 812, authorsFetched: 300, completedAt: "t3" },
  ];
  let index = 0;
  const seen = [];
  const sent = [];
  const send = async (type) => {
    sent.push(type);
    if (type !== "GET_REFRESH_STATE") return { started: true };
    return states[Math.min(index++, states.length - 1)];
  };
  const result = await runRefresh(send, { pollMs: 1, onProgress: (s) => seen.push(s.phase || s.status) });
  assert.equal(result.candidatesFetched, 812);
  assert.equal(sent[0], "REFRESH");
  assert.ok(sent.filter((t) => t === "GET_REFRESH_STATE").length >= 3);
  assert.deepEqual(seen, ["discovery", "scoring", "ready"]);
});

test("runRefresh surfaces a failed pass instead of hanging", async () => {
  const send = async (type) =>
    type === "GET_REFRESH_STATE" ? { status: "error", message: "budget guard stopped the scan" } : { started: true };
  await assert.rejects(() => runRefresh(send, { pollMs: 1 }), /budget guard stopped the scan/);
});

test("a dropped poll does not abort the watch", async () => {
  let calls = 0;
  const send = async (type) => {
    if (type !== "GET_REFRESH_STATE") return { started: true };
    calls += 1;
    if (calls < 3) throw new Error("service worker unavailable");
    return { status: "ready", candidatesFetched: 5 };
  };
  const result = await runRefresh(send, { pollMs: 1 });
  assert.equal(result.candidatesFetched, 5);
});

test("rebuild starts the rebuild pass, not a manual one", async () => {
  const sent = [];
  const send = async (type) => {
    sent.push(type);
    return type === "GET_REFRESH_STATE" ? { status: "ready", indexedRetrieved: 9 } : { started: true };
  };
  await runRefresh(send, { reason: "rebuild", pollMs: 1 });
  assert.equal(sent[0], "REBUILD");
});

test("progress text stays readable when counts are missing", () => {
  assert.equal(describeProgress(null), "");
  assert.equal(describeProgress({ status: "ready" }), "");
  assert.match(describeProgress({ status: "running" }), /starting/);
  assert.match(
    describeProgress({ status: "running", phase: "discovery", lane: "authors", fetched: 12, total: 40 }),
    /discovery · authors · 12 of 40/,
  );
});
