import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUTO_SCAN_CHOICES,
  autoScanDue,
  normalizeAutoScanHours,
  normalizeSettings,
} from "../src/shared/defaults.js";

const worker = await readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
const optionsPage = await readFile(new URL("../src/options/options.html", import.meta.url), "utf8");
const optionsScript = await readFile(new URL("../src/options/options.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

const HOUR = 60 * 60 * 1000;

test("the interval choices are exactly the ones offered", () => {
  assert.deepEqual(AUTO_SCAN_CHOICES.map((c) => c.hours), [0, 3, 6, 24, 72]);
  for (const { hours } of AUTO_SCAN_CHOICES) {
    assert.ok(optionsPage.includes(`value="${hours}"`), `missing option ${hours}`);
  }
  assert.match(optionsPage, /id="auto-scan"/);
  assert.match(optionsScript, /autoScanHours: Number\(document\.querySelector\("#auto-scan"\)\.value\)/);
});

test("an unknown or hostile interval falls back to manual", () => {
  for (const bad of [undefined, null, "", "soon", -3, 1, 5, 999, NaN, Infinity, {}, []]) {
    assert.equal(normalizeAutoScanHours(bad), 0, `${JSON.stringify(bad)} should disable scanning`);
  }
  for (const good of [0, 3, 6, 24, 72, "6", "24"]) {
    assert.equal(normalizeAutoScanHours(good), Number(good));
  }
  assert.equal(normalizeSettings({ autoScanHours: 7 }).autoScanHours, 0);
  assert.equal(normalizeSettings({ autoScanHours: 24 }).autoScanHours, 24);
  assert.equal(normalizeSettings({}).autoScanHours, 0, "manual by default");
});

test("a pass is due only once the chosen interval has elapsed", () => {
  const now = Date.parse("2026-08-18T12:00:00Z");
  const ago = (hours) => new Date(now - hours * HOUR).toISOString();

  // Off means never, no matter how long it has been.
  assert.equal(autoScanDue(0, ago(1000), now), false);
  // Never scanned before: due immediately once enabled.
  assert.equal(autoScanDue(3, null, now), true);
  assert.equal(autoScanDue(3, "not-a-date", now), true);

  assert.equal(autoScanDue(3, ago(2.9), now), false);
  assert.equal(autoScanDue(3, ago(3.1), now), true);
  assert.equal(autoScanDue(6, ago(5.9), now), false);
  assert.equal(autoScanDue(6, ago(6.1), now), true);
  assert.equal(autoScanDue(24, ago(23), now), false);
  assert.equal(autoScanDue(24, ago(25), now), true);
  assert.equal(autoScanDue(72, ago(71), now), false);
  assert.equal(autoScanDue(72, ago(73), now), true);

  // Exactly on the boundary counts as due.
  assert.equal(autoScanDue(3, ago(3), now), true);
  // A future timestamp (clock change) must not scan every wake-up.
  assert.equal(autoScanDue(3, new Date(now + 5 * HOUR).toISOString(), now), false);
});

test("the worker can be woken while Chrome is closed and while it is open", () => {
  // Startup covers the interval elapsing with the browser shut; the alarm
  // covers a browser left running for days.
  assert.ok(manifest.permissions.includes("alarms"));
  assert.match(worker, /chrome\.runtime\.onStartup[\s\S]*?runAutoScanIfDue\("startup"\)/);
  assert.match(worker, /chrome\.alarms\.onAlarm\.addListener/);
  assert.match(worker, /chrome\.alarms\.create\(AUTO_SCAN_ALARM/);
  // Turning the setting off must clear the alarm rather than leave it firing.
  assert.match(worker, /await chrome\.alarms\.clear\(AUTO_SCAN_ALARM\);/);
  assert.match(worker, /if \(!normalizeAutoScanHours\(autoScanHours\)\) return;/);
  assert.match(worker, /case "SETTINGS_CHANGED":[\s\S]*?await scheduleAutoScan\(\);/);
});

test("an automatic pass refuses to run without a key, a scope, or a due interval", () => {
  const guard = worker.match(/async function runAutoScanIfDue[\s\S]*?\n\}/)?.[0] || "";
  assert.match(guard, /if \(!hours\) return/);
  assert.match(guard, /needs an API key and a selected category/);
  assert.match(guard, /if \(!autoScanDue\(hours, lastScan\)\) return/);
  // A pass already in flight must not be duplicated.
  assert.match(guard, /if \(refreshPromise\) return/);
  // The attempt is stamped before the pass so a failure cannot retry in a loop.
  assert.ok(
    guard.indexOf('setMetadata("lastAutoScan"') < guard.indexOf("await refresh("),
    "the attempt must be stamped before the pass starts",
  );
});

test("the toolbar shows a red count that follows the inbox", () => {
  assert.match(worker, /async function refreshUnreadBadge/);
  assert.match(worker, /chrome\.action\.setBadgeBackgroundColor/);
  assert.match(worker, /const BADGE_COLOUR = "#c8362f"/);
  // Cleared when nothing is unread, capped when there is a lot.
  assert.match(worker, /unread \? \(unread > 99 \? "99\+" : String\(unread\)\) : ""/);
  // Kept in step on every path that can change the unread count.
  for (const path of ["MARK_NOTIFICATIONS_READ", "CLEAR_NOTIFICATIONS"]) {
    const block = worker.match(new RegExp(`case "${path}":[\\s\\S]{0,320}`))?.[0] || "";
    assert.match(block, /refreshUnreadBadge\(\)/, `${path} should update the badge`);
  }
  assert.match(worker, /Any pass can add unread papers[\s\S]*?await refreshUnreadBadge\(\)/);
});

test("page highlighting is gone from settings and from the worker", () => {
  assert.ok(!optionsPage.includes("show-arxiv-badges"));
  assert.ok(!optionsPage.toLowerCase().includes("highlight"));
  assert.ok(!optionsScript.includes("showArxivBadges"));
  assert.ok(!worker.includes("showArxivBadges"));
  assert.ok(!manifest.content_scripts);
});

test("every header shows the book mark rather than letters", async () => {
  for (const page of [
    "../src/sidepanel/sidepanel.html",
    "../src/options/options.html",
    "../src/notifications/notifications.html",
  ]) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.match(html, /\/assets\/icon-128\.png/, `${page} should use the icon`);
    assert.ok(!/>FR</.test(html), `${page} still renders the FR letters`);
  }
});
