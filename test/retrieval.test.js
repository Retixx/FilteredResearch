import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { matchesResearchFilters, interestMatchEvidence } from "../src/shared/filters.js";
import { applySelectivity } from "../src/shared/ranking.js";
import { normalizeSettings } from "../src/shared/defaults.js";

const worker = await readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
const optionsScript = await readFile(new URL("../src/options/options.js", import.meta.url), "utf8");
const notificationsScript = await readFile(new URL("../src/notifications/notifications.js", import.meta.url), "utf8");

const AI_SCOPE = {
  englishOnly: true,
  selectedSubfields: ["1702"],
  selectedArxivCategories: ["cs.AI"],
  queries: ["mechanistic interpretability", "multi-agent systems"],
};

function paper(index, { phrase = false, topic = "Artificial Intelligence" } = {}) {
  return {
    id: `W${index}`,
    language: "en",
    title: phrase ? "On mechanistic interpretability of transformers" : `Neural method number ${index}`,
    abstract: phrase
      ? "We study mechanistic interpretability in depth."
      : "A transformer study using attention and gradient analysis for artificial intelligence tasks.",
    subfieldId: "1702",
    subfieldName: topic,
    fieldId: "17",
    fieldName: "Computer Science",
    arxivCategories: ["cs.AI"],
    noveltyScore: 50 + (index % 50),
    researcherScore: 50 + (index % 40),
    discoveryScore: 50 + (index % 45),
    publicationDate: "2026-08-10",
  };
}

test("a chosen category is what filters; interests do not exclude the rest", () => {
  // Reproduces the reported result: an index of ~900 in-scope papers collapsed
  // to a handful because every paper had to repeat an interest phrase.
  const corpus = Array.from({ length: 900 }, (_, index) => paper(index, { phrase: index % 100 === 0 }));
  const settings = normalizeSettings(AI_SCOPE);

  const kept = corpus.filter((work) => matchesResearchFilters(work, settings));
  assert.equal(kept.length, 900, "every in-scope paper should survive filtering");

  const selected = applySelectivity(kept, settings);
  const strictSettings = normalizeSettings({ ...AI_SCOPE, strictInterestFilter: true });
  const strictOnly = corpus.filter((work) => matchesResearchFilters(work, strictSettings));
  const strictSelected = applySelectivity(strictOnly, strictSettings);
  assert.ok(
    selected.works.length >= 15,
    `expected tens of results at 70/70, got ${selected.works.length}`,
  );
  assert.ok(
    selected.works.length >= strictSelected.works.length * 5,
    `phrase gating suppressed results: ${strictSelected.works.length} -> ${selected.works.length}`,
  );

  // Strict mode still reproduces the old, narrow behaviour on request.
  assert.equal(strictOnly.length, 9, "strict mode keeps only phrase-bearing papers");
  assert.ok(
    strictSelected.works.length < 5,
    "strict mode is the narrow behaviour that produced single-digit results",
  );
});

test("an interest is recognised from the paper's own topic labels", () => {
  const byTopic = {
    title: "Sparse autoencoders for feature attribution",
    abstract: "We analyse learned features without naming the field.",
    subfieldName: "Mechanistic Interpretability",
  };
  assert.equal(interestMatchEvidence(byTopic, ["mechanistic interpretability"])?.location, "topic");
  const byAbstract = { title: "x", abstract: "a study of multi-agent systems in the wild" };
  assert.equal(interestMatchEvidence(byAbstract, ["multi-agent systems"])?.location, "abstract");
  assert.equal(interestMatchEvidence({ title: "unrelated", abstract: "chemistry" }, ["multi-agent systems"]), null);
});

test("with no category chosen an interest still scopes the feed", () => {
  const settings = normalizeSettings({ queries: ["multi-agent systems"], englishOnly: true });
  const off = { id: "A", language: "en", title: "Medieval crop yields", abstract: "agriculture" };
  const on = { id: "B", language: "en", title: "Multi-agent systems at scale", abstract: "agents" };
  assert.equal(matchesResearchFilters(off, settings), false);
  assert.equal(matchesResearchFilters(on, settings), true);
});

test("discovery indexes the whole chosen scope instead of keyword slices", () => {
  // Attaching `search` to the scope lane meant the local index only ever held
  // papers repeating the interest phrase.
  const lanes = worker.match(/const lanes = \[\][\s\S]*?if \(!hasTaxonomySelection/)?.[0] || "";
  assert.ok(lanes.includes('label: "selected fields"'), "field lane missing");
  assert.ok(lanes.includes('label: "selected subfields"'), "subfield lane missing");
  assert.doesNotMatch(lanes, /for \(const query of settings\.queries/);
  assert.match(lanes, /query: ""/);
});

test("coverage is measured on records downloaded, not on merged papers", () => {
  // retrieved/total compared post-dedup papers against summed per-lane counts,
  // so a complete pass reported as low as 70%.
  assert.match(worker, /records: uniqueRecords\.length/);
  assert.match(worker, /100 \* \(discovery\.records \?\? discovery\.retrieved\)/);
});

test("no click handler touches currentTarget after awaiting", () => {
  // event.currentTarget is null once the handler resumes, which threw
  // "Cannot set properties of null" on the notifications page.
  for (const [name, source] of [["notifications", notificationsScript], ["options", optionsScript]]) {
    const handlers = source.match(/addEventListener\("click", async \(event\) => \{[\s\S]*?\n\}\);/g) || [];
    for (const handler of handlers) {
      // Comments mention "await"; only executable statements matter here.
      const code = handler
        .split(String.fromCharCode(10))
        .filter((line) => !line.trim().startsWith("//"))
        .join(String.fromCharCode(10));
      const afterAwait = code.slice(code.indexOf("await "));
      assert.doesNotMatch(afterAwait, /currentTarget/, `${name} uses currentTarget after await`);
    }
  }
});

test("saving settings cannot revert the side panel's index depth", () => {
  // The form held a snapshot from page load and wrote it back wholesale.
  assert.match(optionsScript, /const live = await loadSettings\(\);/);
  assert.match(optionsScript, /maxTimeframeDays: live\.maxTimeframeDays/);
});
