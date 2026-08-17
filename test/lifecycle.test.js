import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  INDEX_DEPTHS,
  MAX_INDEX_DEPTH_DAYS,
  WINDOWS,
  normalizeSettings,
} from "../src/shared/defaults.js";

const worker = await readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/sidepanel/sidepanel.html", import.meta.url), "utf8");
const panelScript = await readFile(new URL("../src/sidepanel/sidepanel.js", import.meta.url), "utf8");
const db = await readFile(new URL("../src/shared/db.js", import.meta.url), "utf8");
const sites = await readFile(new URL("../src/content/research-sites.js", import.meta.url), "utf8");

test("discovery has no alarm, startup, settings-save, or depth-change trigger", () => {
  assert.doesNotMatch(worker, /chrome\.alarms/);
  assert.match(worker, /case "SETTINGS_CHANGED":[\s\S]*?discoveryStarted: false/);
  assert.match(worker, /case "SET_MAX_TIME_FRAME":[\s\S]*?discoveryStarted: false/);
  assert.doesNotMatch(worker.match(/chrome\.runtime\.onInstalled[\s\S]*?\n\}\);/)?.[0] || "", /refresh\(/);
  assert.doesNotMatch(worker.match(/chrome\.runtime\.onStartup[\s\S]*?\n\}\);/)?.[0] || "", /refresh\(/);
});

test("both timeframe message spellings are accepted and depth modes are labeled", () => {
  assert.match(worker, /case "SET_MAX_TIME_FRAME":\s*case "SET_MAX_TIMEFRAME":/);
  for (const label of [
    "1 day · Light",
    "3 days · Light",
    "1 week · Moderate",
    "2 weeks · Moderate",
    "1 month · Intensive",
    "3 months · Intensive",
  ]) {
    assert.ok(panel.includes(label), `missing depth label: ${label}`);
  }
});

test("index depth and date views stop at three months", () => {
  assert.equal(Object.keys(WINDOWS).length, 6);
  for (const retired of ["6m", "year"]) {
    assert.ok(!(retired in WINDOWS), `${retired} should no longer be a date view`);
    assert.ok(!panel.includes(`data-window="${retired}"`), `${retired} tab still rendered`);
  }
  assert.equal(Math.max(...Object.values(WINDOWS).map((config) => config.days)), MAX_INDEX_DEPTH_DAYS);
  assert.deepEqual(
    INDEX_DEPTHS.map((depth) => depth.days),
    [1, 3, 7, 14, 30, 90],
  );
  assert.deepEqual(
    [...new Set(INDEX_DEPTHS.map((depth) => depth.tier))],
    ["Light", "Moderate", "Intensive"],
  );
  for (const value of INDEX_DEPTHS.map((depth) => depth.days)) {
    assert.ok(panel.includes(`value="${value}"`), `missing depth option: ${value}`);
  }
});

test("a saved six-month or one-year depth migrates onto a supported depth", () => {
  for (const stale of [180, 365, 240]) {
    assert.equal(normalizeSettings({ maxTimeframeDays: stale }).maxTimeframeDays, 90);
  }
  assert.equal(normalizeSettings({ maxTimeframeDays: 7 }).maxTimeframeDays, 7);
  for (const stale of ["6m", "year"]) {
    assert.equal(normalizeSettings({ defaultWindow: stale }).defaultWindow, "week");
  }
});

test("switching date views renders from one bundled response", () => {
  // Every window is built from a single corpus scan and the sidebar serves tab
  // clicks from that response, so no tab switch waits on the service worker.
  assert.match(worker, /case "GET_FEED_BUNDLE":/);
  assert.match(worker, /async function getFeedBundle/);
  assert.match(worker, /WINDOW_ORDER\.map/);
  assert.match(panelScript, /send\("GET_FEED_BUNDLE"/);
  assert.match(panelScript, /function showWindow/);
  assert.match(panelScript, /cached && state\.bundleSort === state\.sort/);
});

test("the feed never scans the works store just to report counts", () => {
  // databaseStats read every work and author record on each feed render.
  const feed = worker.match(/async function feedContext[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(feed.includes("feedStats()"), "feed should use the light stats path");
  assert.ok(!feed.includes("databaseStats"), "feed must not call databaseStats");
  assert.doesNotMatch(db.match(/export async function feedStats[\s\S]*?\n\}/)?.[0] || "", /getAll\(/);
  assert.match(worker, /getMetadataMany\(\[/);
});

test("on-page highlighting screens the whole local index", () => {
  // A 30-day cutoff meant search-result pages, which are mostly older work,
  // could never match.
  const siteMatches = worker.match(/async function getSiteMatches[\s\S]*?const qualified[^\n]*\n/)?.[0] || "";
  assert.match(siteMatches, /qualifiedPapers\(settings, \{ days: null \}\)/);
  assert.match(worker, /siteScreenBudgetUsd/);
});

test("a paper stays eligible for highlighting until the index can answer", () => {
  // The worker reports whether its answer is authoritative, so a still-warming
  // index never retires a paper that would otherwise have matched.
  assert.match(worker, /indexReady: false/);
  assert.match(worker, /return \{ matches: await screenSiteItemsInner\(items\), indexReady: true \}/);
  assert.match(sites, /const indexReady = payload\.indexReady !== false;/);
  assert.match(sites, /if \(!response\?\.ok\) return;/);
  const handler = sites.match(/candidates\.forEach\([\s\S]*?\n {6}\}\);/)?.[0] || "";
  assert.match(handler, /if \(match\) \{[\s\S]*?filteredresearchChecked = "true"/);
  assert.match(handler, /if \(indexReady\) candidate\.container\.dataset\.filteredresearchChecked = "true"/);
  // Retries are spaced and bounded so page churn cannot exhaust them and an
  // empty index cannot cause endless screening.
  assert.match(sites, /MIN_RETRY_GAP_MS/);
  assert.match(sites, /DEADLINE_MS/);
  assert.match(sites, /if \(scheduled \|\| expired\(\)\) return;/);
});
