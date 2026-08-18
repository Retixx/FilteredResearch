import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  INDEX_DEPTHS,
  MAX_INDEX_DEPTH_DAYS,
  WINDOWS,
  effectiveHorizonDays,
  normalizeSettings,
  windowsWithin,
} from "../src/shared/defaults.js";
import { arxivSubmissionMonth, firstReleaseDate } from "../src/shared/openalex.js";
import { groupDuplicatePapers } from "../src/shared/papers.js";

const worker = await readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/sidepanel/sidepanel.html", import.meta.url), "utf8");
const panelScript = await readFile(new URL("../src/sidepanel/sidepanel.js", import.meta.url), "utf8");
const db = await readFile(new URL("../src/shared/db.js", import.meta.url), "utf8");
const sites = await readFile(new URL("../src/content/research-sites.js", import.meta.url), "utf8");
const siteScript = sites;
const arxiv = await readFile(new URL("../src/content/arxiv.js", import.meta.url), "utf8");
const notificationsPage = await readFile(new URL("../src/notifications/notifications.html", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

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
  assert.match(worker, /available\.map\(/);
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

test("a narrowed index depth bounds every date view", () => {
  // A completed deeper pass leaves older papers in the store; the saved depth
  // is the ceiling regardless, so a 1-week scope cannot show month-old work.
  assert.equal(effectiveHorizonDays({ maxTimeframeDays: 7 }, { horizonDays: 30 }), 7);
  assert.equal(effectiveHorizonDays({ maxTimeframeDays: 30 }, { horizonDays: 7 }), 7);
  assert.equal(effectiveHorizonDays({ maxTimeframeDays: 7 }, null), 7);
  assert.deepEqual(windowsWithin(7), ["day", "3d", "week"]);
  assert.deepEqual(windowsWithin(90), ["day", "3d", "week", "2w", "month", "3m"]);
  // The worker owns the clamp and reports it, so the picker cannot display a
  // scope the feed did not actually apply.
  assert.match(worker, /effectiveHorizonDays\(settings, coverage\)/);
  assert.match(worker, /availableWindows: available/);
  assert.match(panelScript, /state\.availableWindows = bundle\.availableWindows/);
  assert.match(panelScript, /if \(state\.availableWindows && !state\.availableWindows\.includes\(window\)\) return;/);
});

test("recency uses first public release, not journal re-publication", () => {
  assert.equal(arxivSubmissionMonth("2505.22502"), "2025-05-01");
  assert.equal(arxivSubmissionMonth("math/0309136"), "2003-09-01");
  assert.equal(arxivSubmissionMonth("not-an-id"), null);
  // The reported case: on arXiv in May 2025, re-published by a journal in 2026.
  assert.equal(
    firstReleaseDate({ arxivId: "2505.22502", publicationDate: "2026-08-14" }),
    "2025-05-01",
  );
  // A genuinely new preprint keeps its precise date rather than losing days.
  assert.equal(
    firstReleaseDate({ arxivId: "2608.01234", publicationDate: "2026-08-15" }),
    "2026-08-15",
  );
  assert.equal(firstReleaseDate({ publicationDate: "2026-08-15" }), "2026-08-15");
  const [merged] = groupDuplicatePapers([
    { id: "W1", title: "Assessing quantum advantage", authorships: [{ name: "Dominic Lowe" }], arxivId: "2505.22502", publicationDate: "2026-08-14" },
    { id: "W2", title: "Assessing quantum advantage", authorships: [{ name: "Dominic Lowe" }], publicationDate: "2026-08-14" },
  ]);
  assert.equal(merged.firstReleaseDate, "2025-05-01");
  assert.match(worker, /function releasedOn/);
});

test("every content script reads the screening envelope the worker sends", () => {
  // arxiv.js read result as a flat map after the envelope changed, which
  // silently removed every badge on arXiv pages.
  assert.match(arxiv, /result\?\.matches/);
  assert.doesNotMatch(arxiv, /const scores = response\.result \|\| \{\};/);
  assert.match(sites, /payload\.matches/);
});

test("highlighting covers many publishers without touching other browsing", () => {
  const matches = manifest.content_scripts.flatMap((script) => script.matches);
  assert.ok(matches.length > 20, "expected broad research-site coverage");
  assert.ok(matches.every((site) => site.startsWith("https://")));
  assert.ok(matches.every((site) => !site.includes("<all_urls>") && !site.includes("*://")));
  for (const host of ["nature.com", "sciencedirect.com", "biorxiv.org", "openreview.net"]) {
    assert.ok(matches.some((site) => site.includes(host)), `missing ${host}`);
  }
  // Nothing runs at all on a page with no scholarly markers.
  assert.match(siteScript, /function hasScholarlySignal/);
  assert.match(siteScript, /if \(!hasScholarlySignal\(\)\) return;/);
});

test("retrieval is hybrid and never blocks a render", () => {
  assert.match(worker, /case "FILL_FEED_GAP":/);
  assert.match(worker, /GAP_FILL_INTERVAL_MS/);
  assert.match(worker, /already filled recently/);
  // The fill runs after the local render has settled, not before it.
  const loadStart = panelScript.indexOf("async function loadFeed");
  const loadEnd = panelScript.indexOf("function showWindow", loadStart);
  const loadBody = panelScript.slice(loadStart, loadEnd);
  assert.equal((loadBody.match(/fillGap\(\);/g) || []).length, 1, "one fill per load");
  assert.ok(
    loadBody.indexOf('aria-busy", "false"') < loadBody.indexOf("fillGap();"),
    "fill must start after the load releases its in-progress guard",
  );
  assert.match(panelScript, /would be rejected by the in-progress guard[\s\S]*?fillGap\(\);/);
});

test("the notification page states how screening actually happens", () => {
  // v0.5.1 removed startup and interval discovery; the page still claimed both.
  assert.doesNotMatch(notificationsPage, /screens at Chrome startup/);
  assert.match(notificationsPage, /Screening only runs when you ask for it/);
  // A first pass seeds the inbox so the page is reachable for a new user.
  assert.match(worker, /const seeding = !previousLastRefresh;/);
});
