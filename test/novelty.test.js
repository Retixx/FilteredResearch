import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SCORING_VERSION, scoreBatch } from "../src/shared/scoring.js";

const panelScript = await readFile(new URL("../src/sidepanel/sidepanel.js", import.meta.url), "utf8");
const notificationsScript = await readFile(new URL("../src/notifications/notifications.js", import.meta.url), "utf8");
const optionsScript = await readFile(new URL("../src/options/options.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");

// A field whose papers overlap only partially, which is what real title and
// abstract text looks like once the vocabulary is large.
let seed = 7;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pool = (prefix, size) => Array.from({ length: size }, (_, i) => `${prefix}${i}`);
const sample = (terms, n) => {
  const out = [];
  const used = new Set();
  while (out.length < n && used.size < terms.length) {
    const i = Math.floor(rnd() * terms.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(terms[i]);
  }
  return out;
};
const FIELD = pool("term", 1500);
const FOREIGN = pool("unrelated", 400);
const paper = (id, date, terms = FIELD, size = 180) => ({
  id,
  title: sample(terms, 8).join(" "),
  abstract: sample(terms, size).join(" "),
  subfieldId: "1702", domainId: "1", publicationDate: date,
  authorships: [], topics: [{ fieldId: "17" }],
});

const references = Array.from({ length: 240 }, (_, i) => paper(`R${i}`, "2024-01-01"));
const typical = Array.from({ length: 40 }, (_, i) => paper(`typical${i}`, "2026-01-01"));
const derivative = Array.from({ length: 6 }, (_, i) => ({
  ...references[i], id: `derivative${i}`, publicationDate: "2026-01-01",
}));
const breakthrough = Array.from({ length: 3 }, (_, i) => paper(`breakthrough${i}`, "2026-01-01", FOREIGN, 150));
const scored = scoreBatch([...typical, ...derivative, ...breakthrough], references, []);
const scoreOf = (prefix) => scored.filter((w) => w.id.startsWith(prefix)).map((w) => w.noveltyScore);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test("novelty uses the whole 1-100 range instead of bunching high", () => {
  const all = scored.map((w) => w.noveltyScore);
  const sorted = [...all].sort((a, b) => a - b);
  const p = (q) => sorted[Math.floor(q * (sorted.length - 1))];
  assert.ok(Math.max(...all) - Math.min(...all) > 70, `range too narrow: ${Math.min(...all)}-${Math.max(...all)}`);
  // The old formula put a floor near 50; a real field must populate below it.
  const below = all.filter((v) => v < 50).length;
  assert.ok(below >= all.length * 0.25, `only ${below}/${all.length} below 50`);
  assert.ok(p(0.25) < 45 && p(0.75) > 55, `quartiles not spread: ${Math.round(p(0.25))}/${Math.round(p(0.75))}`);
});

test("groundbreaking work separates clearly from derivative work", () => {
  const derived = mean(scoreOf("derivative"));
  const usual = mean(scoreOf("typical"));
  const novel = mean(scoreOf("breakthrough"));
  assert.ok(derived < 20, `derivative work should score low, got ${derived.toFixed(0)}`);
  assert.ok(novel > 85, `genuinely new work should score high, got ${novel.toFixed(0)}`);
  // The whole point of the sliders: the gap must be large, not a few points.
  assert.ok(novel - usual > 30, `novel/typical gap too small: ${(novel - usual).toFixed(0)}`);
  assert.ok(usual - derived > 20, `typical/derivative gap too small: ${(usual - derived).toFixed(0)}`);
});

test("scores stay sane when the field is too small to calibrate", () => {
  const tiny = scoreBatch([paper("solo", "2026-01-01")], [paper("R", "2024-01-01")], []);
  const score = tiny[0].noveltyScore;
  assert.ok(Number.isFinite(score) && score >= 0 && score <= 100, `bad score: ${score}`);
  assert.equal(tiny[0].noveltyEvidence.calibrated, false);
  // No peers at all must not divide by zero or produce NaN.
  const orphan = scoreBatch([paper("alone", "2026-01-01")], [], []);
  assert.ok(Number.isFinite(orphan[0].noveltyScore));
});

test("changing the scale forces stored scores to be recomputed", () => {
  assert.equal(SCORING_VERSION, "peer-calibrated-novelty-v3");
  assert.match(worker, /item\.scoringVersion !== SCORING_VERSION/);
  assert.match(worker, /scoreBatch\(\[\.\.\.candidates, \.\.\.stale\]/);
});

test("invalid dates cannot crash a render", () => {
  // Intl throws RangeError on an invalid date value.
  for (const source of [panelScript, notificationsScript]) {
    assert.match(source, /Number\.isNaN\(parsed\.getTime\(\)\)/);
  }
  assert.match(panelScript, /function relativeHours/);
  assert.match(panelScript, /if \(!Number\.isFinite\(parsed\)\) return null;/);
});

test("no async click handler can reject unhandled", () => {
  for (const [name, source] of [["notifications", notificationsScript], ["options", optionsScript]]) {
    const handlers = source.match(/addEventListener\("click", async [^)]*\) => \{[\s\S]*?\n\}\);/g) || [];
    assert.ok(handlers.length, `${name}: no handlers found`);
    for (const handler of handlers) {
      assert.match(handler, /try \{/, `${name} has an async click handler without try/catch`);
      assert.match(handler, /catch \(error\)/, `${name} has an async click handler without catch`);
    }
  }
  // Fire-and-forget extension APIs in the panel are caught too.
  assert.match(panelScript, /Promise\.resolve\(chrome\.tabs\.create/);
  assert.match(panelScript, /Promise\.resolve\(chrome\.runtime\.openOptionsPage/);
  assert.match(panelScript, /\.catch\(\(error\) => \{[\s\S]*?Could not read saved settings/);
});

test("the indexed similarity search matches a naive pairwise implementation", async () => {
  // Crowding is computed through a term posting list rather than by comparing
  // every candidate with every peer. That is an optimisation, so it has to
  // produce the same numbers, not merely similar ones.
  const { buildVector, cosineSimilarity, scoreBatch: score } = await import("../src/shared/scoring.js");
  let s = 99;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const vocab = Array.from({ length: 600 }, (_, i) => `w${i}`);
  const words = (n) => Array.from({ length: n }, () => vocab[Math.floor(rnd() * vocab.length)]).join(" ");
  const mk = (id, date) => ({
    id, title: words(8), abstract: words(100),
    subfieldId: "1702", domainId: "1", publicationDate: date, authorships: [], topics: [{ fieldId: "17" }],
  });
  const references = Array.from({ length: 120 }, (_, i) => mk(`R${i}`, "2024-01-01"));
  const candidates = Array.from({ length: 60 }, (_, i) => mk(`C${i}`, "2026-01-01"));
  const scored = score(candidates, references, []);

  const all = [...references, ...candidates];
  const df = new Map();
  for (const w of all) {
    for (const t of new Set(`${w.title} ${w.abstract}`.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [])) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }
  const idf = new Map([...df].map(([t, f]) => [t, Math.log((all.length + 1) / (f + 1)) + 1]));
  const vectors = new Map(all.map((w) => [w.id, buildVector(`${w.title} ${w.abstract}`, idf)]));
  const peerVectors = references.map((r) => vectors.get(r.id));

  for (const work of scored) {
    const sims = peerVectors.map((peer) => cosineSimilarity(vectors.get(work.id), peer));
    const nearest = Math.max(...sims);
    const top = [...sims].sort((a, b) => b - a).slice(0, 5);
    const expected = 0.65 * nearest + 0.35 * (top.reduce((a, b) => a + b, 0) / top.length);
    assert.ok(Math.abs(expected - work.noveltyEvidence.crowding) < 1e-9,
      `crowding drifted for ${work.id}: ${expected} vs ${work.noveltyEvidence.crowding}`);
    assert.ok(Math.abs(nearest - work.nearestSimilarity) < 1e-9, `nearest drifted for ${work.id}`);
  }
});
